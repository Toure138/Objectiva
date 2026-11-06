import { Component, computed, inject, input, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AlertController, IonButton, IonContent, IonIcon, ModalController, ToastController } from '@ionic/angular';
import {
  archiveOutline,
  checkmark,
  close,
  createOutline,
  pause,
  pauseCircleOutline,
  playOutline,
  trashOutline,
} from 'ionicons/icons';

import { ApiService } from '../core/api.service';
import { longDate } from '../core/dates';
import { HABIT_DAY_LABELS, frequencyLabel } from '../core/habits';
import type { HabitDayState, HabitDetail } from '../core/models';
import { WEEKDAYS } from '../core/repeat';
import { PageHeaderComponent } from '../shared/page-header.component';
import { StateViewComponent } from '../shared/state-view.component';

import { HabitFormComponent } from './habit-form.component';

/** Fiche d'une habitude (spec 012) : chiffres clés, grille des 5 dernières semaines, actions. */
@Component({
  selector: 'app-habit-detail',
  imports: [PageHeaderComponent, StateViewComponent, IonContent, IonButton, IonIcon],
  template: `
    <app-page-header title="Habitude" backHref="/app/habitudes" [showProfile]="false">
      <ion-button class="ob-icon-btn" fill="clear" (click)="edit()" aria-label="Modifier l’habitude">
        <ion-icon slot="icon-only" [icon]="icons.edit"></ion-icon>
      </ion-button>
      <ion-button class="ob-icon-btn" fill="clear" (click)="remove()" aria-label="Supprimer l’habitude">
        <ion-icon slot="icon-only" [icon]="icons.trash"></ion-icon>
      </ion-button>
    </app-page-header>
    <ion-content>
      <div class="ob-container">
        <app-state-view [loading]="loading()" [error]="error()" [hero]="true" (retry)="load()">
          @if (habit(); as h) {
            <section class="ob-card ob-habit-hero ob-rise">
              <h1 class="ob-display">{{ h.title }}</h1>
              <p class="ob-muted">{{ frequency() }}</p>
              <div class="ob-habit-chips">
                @if (h.status === 'ARCHIVEE') {
                  <span class="ob-chip"><ion-icon [icon]="icons.archive" aria-hidden="true"></ion-icon>Archivée</span>
                } @else if (h.paused) {
                  <span class="ob-chip"><ion-icon [icon]="icons.paused" aria-hidden="true"></ion-icon>En pause</span>
                }
                @if (h.week) {
                  <span class="ob-chip">{{ h.week.done }} sur {{ h.week.target }} cette semaine</span>
                }
              </div>
              <dl class="ob-habit-stats">
                <div>
                  <dt>Série</dt>
                  <dd class="ob-display">{{ h.streak.value }}</dd>
                  <dd class="unit">{{ unit() }}</dd>
                </div>
                <div>
                  <dt>Meilleure</dt>
                  <dd class="ob-display">{{ h.bestStreak }}</dd>
                  <dd class="unit">{{ bestUnit() }}</dd>
                </div>
                <div>
                  <dt>30 jours</dt>
                  <dd class="ob-display">{{ rate() }}</dd>
                  <dd class="unit">{{ h.last30.done }} sur {{ h.last30.expected }}</dd>
                </div>
              </dl>
            </section>

            <section class="ob-plan-day">
              <h2 class="ob-habit-h2">5 dernières semaines</h2>
              <p class="ob-muted ob-habit-hint">Touche un jour passé pour le cocher ou l’annuler.</p>
              <div class="ob-month-head" aria-hidden="true">
                @for (d of weekdays; track d.day) {
                  <span>{{ d.short }}</span>
                }
              </div>
              <div class="ob-habit-grid" role="group" aria-label="Jours des 5 dernières semaines">
                @for (c of h.grid; track c.date) {
                  <button
                    type="button"
                    [class]="'s-' + c.state"
                    [disabled]="!editable(c.state) || busy()"
                    [attr.aria-label]="cellLabel(c.date, c.state)"
                    (click)="toggle(c.date, c.state)"
                  >
                    <span class="n">{{ +c.date.slice(8) }}</span>
                    @if (c.state === 'FAIT') {
                      <ion-icon [icon]="icons.done" aria-hidden="true"></ion-icon>
                    } @else if (c.state === 'MANQUE') {
                      <ion-icon [icon]="icons.missed" aria-hidden="true"></ion-icon>
                    } @else if (c.state === 'PAUSE') {
                      <ion-icon [icon]="icons.pause" aria-hidden="true"></ion-icon>
                    }
                  </button>
                }
              </div>
              <p class="ob-month-legend">
                <span><ion-icon [icon]="icons.done" aria-hidden="true"></ion-icon> fait</span>
                <span><ion-icon [icon]="icons.missed" aria-hidden="true"></ion-icon> manqué</span>
                <span><ion-icon [icon]="icons.pause" aria-hidden="true"></ion-icon> en pause</span>
              </p>
            </section>

            <div class="ob-habit-actions">
              @if (h.status === 'ACTIVE') {
                @if (h.paused) {
                  <ion-button expand="block" (click)="act('resume')" [disabled]="busy()">
                    <ion-icon slot="start" [icon]="icons.play" aria-hidden="true"></ion-icon>Reprendre
                  </ion-button>
                } @else {
                  <ion-button expand="block" fill="outline" (click)="act('pause')" [disabled]="busy()">
                    <ion-icon slot="start" [icon]="icons.paused" aria-hidden="true"></ion-icon>Faire une pause
                  </ion-button>
                }
                <ion-button expand="block" fill="clear" color="medium" (click)="act('archive')" [disabled]="busy()">
                  Archiver
                </ion-button>
              } @else {
                <ion-button expand="block" fill="outline" (click)="act('unarchive')" [disabled]="busy()"
                  >Réactiver</ion-button
                >
              }
            </div>
            <div class="ob-fab-space"></div>
          }
        </app-state-view>
      </div>
    </ion-content>
  `,
})
export class HabitDetailPage {
  private readonly api = inject(ApiService);
  private readonly alerts = inject(AlertController);
  private readonly modals = inject(ModalController);
  private readonly toasts = inject(ToastController);
  private readonly router = inject(Router);

  /** Paramètre de route `:id`. */
  readonly id = input.required<string>();

  protected readonly habit = signal<HabitDetail | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected readonly weekdays = WEEKDAYS;
  protected readonly icons = {
    edit: createOutline,
    trash: trashOutline,
    archive: archiveOutline,
    paused: pauseCircleOutline,
    play: playOutline,
    done: checkmark,
    missed: close,
    pause,
  };

  protected readonly frequency = computed(() => (this.habit() ? frequencyLabel(this.habit()!) : ''));
  protected readonly unit = computed(() => this.unitFor(this.habit()?.streak.value ?? 0));
  protected readonly bestUnit = computed(() => this.unitFor(this.habit()?.bestStreak ?? 0));
  protected readonly rate = computed(() => {
    const r = this.habit()?.last30.rate;
    return r === null || r === undefined ? '—' : `${Math.round(r * 100)}\u00a0%`;
  });

  ionViewWillEnter(): void {
    void this.load();
  }

  async load(): Promise<void> {
    this.error.set(null);
    try {
      this.habit.set(await this.api.habit(this.id()));
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'Chargement impossible');
    } finally {
      this.loading.set(false);
    }
  }

  /** « jour » ou « jours », « semaine » ou « semaines », selon l'unité de la série. */
  private unitFor(n: number): string {
    const weeks = this.habit()?.streak.unit === 'SEMAINES';
    if (weeks) return n > 1 ? 'semaines' : 'semaine';
    return n > 1 ? 'jours' : 'jour';
  }

  protected editable(state: HabitDayState): boolean {
    return state !== 'AVANT' && state !== 'FUTUR';
  }

  protected cellLabel(date: string, state: HabitDayState): string {
    const base = `${longDate(date)} : ${HABIT_DAY_LABELS[state]}`;
    if (!this.editable(state)) return base;
    return `${base}. ${state === 'FAIT' ? 'Toucher pour annuler.' : 'Toucher pour cocher.'}`;
  }

  protected async toggle(date: string, state: HabitDayState): Promise<void> {
    await this.run(async () => {
      await this.api.markHabit(this.id(), state !== 'FAIT', date);
      await this.load();
    });
  }

  protected async act(action: 'pause' | 'resume' | 'archive' | 'unarchive'): Promise<void> {
    await this.run(async () => {
      await this.api.habitAction(this.id(), action);
      await this.load();
      const said = {
        pause: 'Pause enregistrée : ces jours ne comptent pas.',
        resume: 'C’est reparti !',
        archive: 'Habitude archivée.',
        unarchive: 'Habitude réactivée.',
      };
      await this.say(said[action]);
    });
  }

  protected async edit(): Promise<void> {
    const modal = await this.modals.create({ component: HabitFormComponent, componentProps: { habit: this.habit() } });
    await modal.present();
    if ((await modal.onWillDismiss()).role === 'saved') await this.load();
  }

  protected async remove(): Promise<void> {
    const alert = await this.alerts.create({
      header: 'Supprimer cette habitude ?',
      message: 'Son historique sera effacé. Pour la garder sans la suivre, archive-la plutôt.',
      buttons: [
        { text: 'Garder', role: 'cancel' },
        { text: 'Supprimer', role: 'destructive' },
      ],
    });
    await alert.present();
    if ((await alert.onWillDismiss()).role !== 'destructive') return;
    await this.run(async () => {
      await this.api.deleteHabit(this.id());
      await this.router.navigateByUrl('/app/habitudes', { replaceUrl: true });
    });
  }

  // `busy` bloque le double appui ; l'erreur est affichée telle quelle.
  private async run(action: () => Promise<void>): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    try {
      await action();
    } catch (e) {
      await this.say(e instanceof Error ? e.message : 'Action impossible', true);
    } finally {
      this.busy.set(false);
    }
  }

  private async say(message: string, danger = false): Promise<void> {
    const t = await this.toasts.create({
      message,
      duration: 2500,
      position: 'top',
      cssClass: danger ? 'ob-toast ob-toast-danger' : 'ob-toast',
    });
    await t.present();
  }
}
