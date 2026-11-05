import { Injectable, InjectionToken, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Capacitor } from '@capacitor/core';
import { LocalNotifications, type LocalNotificationsPlugin } from '@capacitor/local-notifications';
import { Preferences } from '@capacitor/preferences';

import {
  DEFAULT_REMINDER,
  REMINDER_CHOICES,
  notificationId,
  reminderAt,
  reminderText,
  type ReminderChoice,
} from '../../../../shared/src/reminders.rules';

import { ApiService } from './api.service';
import { AuthService } from './auth.service';
import { addDays, localToday } from './dates';
import type { CalendarEvent } from './models';

/** Module de notifications locales (remplaçable dans les tests). */
export type NotificationsPort = Pick<
  LocalNotificationsPlugin,
  | 'checkPermissions'
  | 'requestPermissions'
  | 'checkExactNotificationSetting'
  | 'changeExactNotificationSetting'
  | 'getPending'
  | 'cancel'
  | 'schedule'
  | 'createChannel'
  | 'addListener'
>;
export const NOTIFICATIONS = new InjectionToken<NotificationsPort>('notifications', {
  factory: () => LocalNotifications,
});
/** Vrai dans l'application Android ou iOS : les rappels n'existent pas dans le navigateur. */
export const IS_NATIVE = new InjectionToken<boolean>('isNative', { factory: () => Capacitor.isNativePlatform() });

/** Rendez-vous des 14 prochains jours, 60 rappels au plus (limites des alarmes programmées). */
const WINDOW_DAYS = 14;
const MAX_REMINDERS = 60;
/** Un rappel trop proche ne serait pas affiché à temps : on l'ignore. */
const MIN_LEAD_MS = 30_000;
const CHANNEL = 'rendez-vous';
const KIND = 'rendez-vous';
const ENABLED_KEY = 'objectiva.reminders.enabled';
const DEFAULT_KEY = 'objectiva.reminders.default';

export type ReminderPermission = 'granted' | 'denied' | 'prompt' | 'unavailable';

/**
 * Rappels avant les rendez-vous (spec 011). Le téléphone les programme lui-même, sans réseau ni serveur :
 * à chaque modification, synchronisation ou retour au premier plan, les anciens rappels sont annulés et
 * ceux des 14 prochains jours reprogrammés. Le moment et le texte viennent des règles partagées.
 */
@Injectable({ providedIn: 'root' })
export class RemindersService {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly plugin = inject(NOTIFICATIONS);
  private readonly native = inject(IS_NATIVE);

  readonly enabled = signal(true);
  readonly defaultChoice = signal<ReminderChoice>(DEFAULT_REMINDER);
  readonly permission = signal<ReminderPermission>('prompt');
  /** Alarmes exactes (Android 12+) : sans elles, un rappel peut arriver avec quelques minutes de retard. */
  readonly exact = signal<'granted' | 'denied' | 'unknown'>('unknown');
  readonly scheduled = signal(0);

  private started = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running: Promise<void> | null = null;
  private again = false;

  /** Au lancement : réglages, canal Android et ouverture de la fiche au toucher d'une notification. */
  async init(): Promise<void> {
    if (this.started) return;
    this.started = true;
    const [{ value: enabled }, { value: choice }] = await Promise.all([
      Preferences.get({ key: ENABLED_KEY }),
      Preferences.get({ key: DEFAULT_KEY }),
    ]);
    if (enabled === 'false') this.enabled.set(false);
    if (choice && (REMINDER_CHOICES as readonly string[]).includes(choice))
      this.defaultChoice.set(choice as ReminderChoice);
    if (!this.native) {
      this.permission.set('unavailable');
      return;
    }
    try {
      await this.plugin.createChannel({
        id: CHANNEL,
        name: 'Rendez-vous',
        description: 'Rappels avant tes rendez-vous et réunions',
        importance: 4,
        visibility: 1,
      });
      await this.plugin.addListener('localNotificationActionPerformed', (action) => {
        const eventId = (action.notification.extra as { eventId?: string } | undefined)?.eventId;
        if (eventId) void this.router.navigate(['/app/evenements', eventId]);
      });
      await this.refreshStatus();
    } catch {
      // Module indisponible : l'application fonctionne sans rappels.
      this.permission.set('unavailable');
    }
  }

  /** Demande une reprogrammation (regroupée : plusieurs demandes rapprochées n'en font qu'une). */
  request(delayMs = 1_500): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.reschedule(), delayMs);
  }

  /** Annule nos rappels et programme ceux des 14 prochains jours. Une seule exécution à la fois. */
  async reschedule(): Promise<void> {
    if (this.running) {
      this.again = true;
      return this.running;
    }
    this.running = (async () => {
      do {
        this.again = false;
        await this.run();
      } while (this.again);
    })().finally(() => (this.running = null));
    return this.running;
  }

  private async run(): Promise<void> {
    if (!this.native) return;
    try {
      await this.cancelOurs();
      if (!this.enabled() || !this.auth.isLoggedIn()) return;
      const planned = await this.plan();
      if (planned.length === 0 || !(await this.ensurePermission())) return;
      await this.plugin.schedule({ notifications: planned });
      this.scheduled.set(planned.length);
    } catch {
      // Un échec de programmation ne doit jamais gêner l'application : nouvel essai au prochain changement.
    }
  }

  /** Rappels à programmer, du plus proche au plus lointain. */
  private async plan() {
    const today = localToday();
    const events = await this.api.events({
      from: today,
      to: addDays(today, WINDOW_DAYS - 1),
      status: 'PREVU',
      limit: 200,
    });
    const timezone = this.auth.user()?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
    const now = Date.now();
    return events
      .map((e: CalendarEvent) => {
        const choice = (e.reminder ?? this.defaultChoice()) as ReminderChoice;
        return { e, choice, at: reminderAt(e, choice) };
      })
      .filter(
        (r): r is { e: CalendarEvent; choice: ReminderChoice; at: Date } =>
          r.at !== null && r.at.getTime() > now + MIN_LEAD_MS,
      )
      .sort((a, b) => a.at.getTime() - b.at.getTime())
      .slice(0, MAX_REMINDERS)
      .map(({ e, choice, at }) => ({
        id: notificationId(e.id),
        ...reminderText(e, choice, timezone),
        schedule: { at, allowWhileIdle: true },
        channelId: CHANNEL,
        extra: { kind: KIND, eventId: e.id },
      }));
  }

  private async cancelOurs(): Promise<void> {
    const { notifications } = await this.plugin.getPending();
    const ours = notifications.filter((n) => (n.extra as { kind?: string } | undefined)?.kind === KIND);
    if (ours.length > 0) await this.plugin.cancel({ notifications: ours.map((n) => ({ id: n.id })) });
    this.scheduled.set(0);
  }

  /** Demande l'autorisation seulement au moment où un rappel est à programmer. */
  private async ensurePermission(): Promise<boolean> {
    let { display } = await this.plugin.checkPermissions();
    if (display === 'prompt' || display === 'prompt-with-rationale')
      ({ display } = await this.plugin.requestPermissions());
    this.permission.set(display === 'granted' ? 'granted' : display === 'denied' ? 'denied' : 'prompt');
    return display === 'granted';
  }

  async refreshStatus(): Promise<void> {
    if (!this.native) return;
    try {
      const { display } = await this.plugin.checkPermissions();
      this.permission.set(display === 'granted' ? 'granted' : display === 'denied' ? 'denied' : 'prompt');
      const { exact_alarm } = await this.plugin.checkExactNotificationSetting();
      this.exact.set(exact_alarm === 'granted' ? 'granted' : exact_alarm === 'denied' ? 'denied' : 'unknown');
    } catch {
      this.exact.set('unknown');
    }
  }

  async setEnabled(on: boolean): Promise<void> {
    this.enabled.set(on);
    await Preferences.set({ key: ENABLED_KEY, value: String(on) });
    await this.reschedule();
  }

  async setDefault(choice: ReminderChoice): Promise<void> {
    this.defaultChoice.set(choice);
    await Preferences.set({ key: DEFAULT_KEY, value: choice });
    await this.reschedule();
  }

  /** Ouvre le réglage Android des alarmes exactes. */
  async openExactSettings(): Promise<void> {
    if (!this.native) return;
    await this.plugin.changeExactNotificationSetting();
    await this.refreshStatus();
  }

  /** Rappel d'essai dans 5 secondes, pour vérifier que tout fonctionne sur ce téléphone. */
  async sendTest(): Promise<boolean> {
    if (!this.native || !(await this.ensurePermission())) return false;
    await this.plugin.schedule({
      notifications: [
        {
          id: 1,
          title: 'Rappel d’essai',
          body: 'Tes rappels de rendez-vous fonctionnent sur ce téléphone.',
          schedule: { at: new Date(Date.now() + 5_000), allowWhileIdle: true },
          channelId: CHANNEL,
          extra: { kind: 'essai' },
        },
      ],
    });
    return true;
  }
}
