import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { notificationId } from '../../../../shared/src/reminders.rules';

import { ApiService } from './api.service';
import { AuthService } from './auth.service';
import type { CalendarEvent } from './models';
import { IS_NATIVE, NOTIFICATIONS, RemindersService } from './reminders.service';

// Spec 011 : programmation des rappels sur le téléphone, avec un faux module de notifications.

interface Pending {
  id: number;
  title: string;
  body: string;
  extra?: unknown;
  schedule?: { at?: Date };
}

class FakeNotifications {
  pending: Pending[] = [];
  display: 'granted' | 'denied' | 'prompt' = 'prompt';
  answer: 'granted' | 'denied' = 'granted';
  requests = 0;
  checkPermissions = vi.fn(async () => ({ display: this.display }));
  requestPermissions = vi.fn(async () => {
    this.requests += 1;
    this.display = this.answer;
    return { display: this.display };
  });
  checkExactNotificationSetting = vi.fn(async () => ({ exact_alarm: 'granted' as const }));
  changeExactNotificationSetting = vi.fn(async () => ({ exact_alarm: 'granted' as const }));
  getPending = vi.fn(async () => ({ notifications: [...this.pending] }));
  cancel = vi.fn(async ({ notifications }: { notifications: { id: number }[] }) => {
    const ids = new Set(notifications.map((n) => n.id));
    this.pending = this.pending.filter((p) => !ids.has(p.id));
  });
  schedule = vi.fn(async ({ notifications }: { notifications: Pending[] }) => {
    this.pending.push(...notifications);
    return { notifications: notifications.map((n) => ({ id: n.id })) };
  });
  createChannel = vi.fn(async () => undefined);
  addListener = vi.fn(async () => ({ remove: async () => undefined }));
}

const NOW = new Date('2026-11-05T08:00:00.000Z');

function event(id: string, startsAt: string, over: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id,
    title: `Rendez-vous ${id}`,
    startsAt,
    location: null,
    travelBeforeMinutes: 0,
    prepBeforeMinutes: 0,
    status: 'PREVU',
    reminder: null,
    ...over,
  } as CalendarEvent;
}

let plugin: FakeNotifications;
let events: CalendarEvent[];
let loggedIn: ReturnType<typeof signal<boolean>>;
let service: RemindersService;
const eventsCall = vi.fn();

function setup(native = true): void {
  plugin = new FakeNotifications();
  loggedIn = signal(true);
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: NOTIFICATIONS, useValue: plugin },
      { provide: IS_NATIVE, useValue: native },
      {
        provide: ApiService,
        useValue: {
          events: async (q: Record<string, unknown>) => {
            eventsCall(q);
            return events.filter((e) => !q['status'] || e.status === q['status']);
          },
        },
      },
      { provide: AuthService, useValue: { isLoggedIn: loggedIn, user: signal({ timezone: 'Africa/Abidjan' }) } },
    ],
  });
  service = TestBed.inject(RemindersService);
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  localStorage.clear();
  events = [];
  eventsCall.mockClear();
});
afterEach(() => {
  vi.useRealTimers();
  TestBed.resetTestingModule();
});

describe('rappels sur le téléphone', () => {
  it('programme les rendez-vous prévus à venir, au bon moment, avec le bon texte, du plus proche au plus lointain', async () => {
    setup();
    events = [
      event('b', '2026-11-06T10:00:00.000Z', { reminder: 'H1', location: 'Salle B' }),
      event('a', '2026-11-05T10:00:00.000Z', { travelBeforeMinutes: 30 }),
    ];
    await service.reschedule();
    expect(eventsCall).toHaveBeenCalledWith(
      expect.objectContaining({ from: '2026-11-05', to: '2026-11-18', status: 'PREVU' }),
    );
    expect(plugin.pending.map((p) => [p.id, p.schedule?.at?.toISOString(), p.title, p.body])).toEqual([
      [notificationId('a'), '2026-11-05T09:30:00.000Z', 'Rendez-vous a à 10:00', 'Pars maintenant'],
      [notificationId('b'), '2026-11-06T09:00:00.000Z', 'Rendez-vous b à 10:00', 'Dans 1 h · Salle B'],
    ]);
    expect(plugin.pending[0]!.extra).toEqual({ kind: 'rendez-vous', eventId: 'a' });
    expect(service.scheduled()).toBe(2);
  });

  it('jamais dans le passé, jamais pour « aucun », ni pour un rendez-vous annulé ou réalisé', async () => {
    setup();
    events = [
      event('passe', '2026-11-05T08:10:00.000Z'), // rappel « départ » à 07:55 : déjà passé
      event('aucun', '2026-11-05T12:00:00.000Z', { reminder: 'AUCUN' }),
      event('annule', '2026-11-05T12:00:00.000Z', { status: 'ANNULE' }),
      event('fait', '2026-11-05T12:00:00.000Z', { status: 'REALISE' }),
      event('ok', '2026-11-05T12:00:00.000Z'),
    ];
    await service.reschedule();
    expect(plugin.pending.map((p) => (p.extra as { eventId: string }).eventId)).toEqual(['ok']);
  });

  it('remplace ses anciens rappels sans toucher aux autres notifications', async () => {
    setup();
    plugin.pending = [
      { id: 7, title: 'Ancien', body: '', extra: { kind: 'rendez-vous', eventId: 'vieux' } },
      { id: 8, title: 'Autre', body: '', extra: { kind: 'autre' } },
    ];
    events = [event('neuf', '2026-11-05T12:00:00.000Z')];
    await service.reschedule();
    expect(plugin.pending.map((p) => p.title).sort()).toEqual(['Autre', 'Rendez-vous neuf à 12:00']);
  });

  it('le réglage par défaut s’applique aux rendez-vous sans choix ; désactiver annule tout', async () => {
    setup();
    events = [event('x', '2026-11-05T12:00:00.000Z')];
    await service.setDefault('M30');
    expect(plugin.pending[0]!.schedule?.at?.toISOString()).toBe('2026-11-05T11:30:00.000Z');
    await service.setEnabled(false);
    expect(plugin.pending).toEqual([]);
    expect(localStorage.getItem('CapacitorStorage.objectiva.reminders.enabled')).toBe('false');
  });

  it('demande l’autorisation seulement s’il y a un rappel ; refusée, rien n’est programmé', async () => {
    setup();
    await service.reschedule();
    expect(plugin.requests).toBe(0);
    plugin.answer = 'denied';
    events = [event('x', '2026-11-05T12:00:00.000Z')];
    await service.reschedule();
    expect(plugin.requests).toBe(1);
    expect(plugin.pending).toEqual([]);
    expect(service.permission()).toBe('denied');
  });

  it('au plus 60 rappels', async () => {
    setup();
    events = Array.from({ length: 80 }, (_, i) =>
      event(`e${i}`, new Date(NOW.getTime() + (i + 1) * 3_600_000).toISOString()),
    );
    await service.reschedule();
    expect(plugin.pending).toHaveLength(60);
  });

  it('déconnecté : les rappels sont annulés', async () => {
    setup();
    events = [event('x', '2026-11-05T12:00:00.000Z')];
    await service.reschedule();
    loggedIn.set(false);
    await service.reschedule();
    expect(plugin.pending).toEqual([]);
  });

  it('dans le navigateur : rien n’est programmé, l’état l’indique', async () => {
    setup(false);
    await service.init();
    events = [event('x', '2026-11-05T12:00:00.000Z')];
    await service.reschedule();
    expect(plugin.schedule).not.toHaveBeenCalled();
    expect(service.permission()).toBe('unavailable');
  });
});
