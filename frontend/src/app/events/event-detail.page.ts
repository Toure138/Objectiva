import { Component, computed, inject, input, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AlertController, IonButton, IonContent, IonIcon, ModalController, ToastController } from '@ionic/angular';
import {
  add,
  calendarOutline,
  checkmarkCircle,
  closeCircleOutline,
  createOutline,
  locationOutline,
  openOutline,
  trashOutline,
  walkOutline,
} from 'ionicons/icons';

import { ApiService } from '../core/api.service';
import { longDate } from '../core/dates';
import { EVENT_TYPE_LABELS, type CalendarEventDetail, type EventTaskRole } from '../core/models';
import { EventFormComponent, minutesLabel } from '../shared/event-form.component';
import { eventIcon } from '../shared/event-item.component';
import { PageHeaderComponent } from '../shared/page-header.component';
import { SectionHeaderComponent } from '../shared/section-header.component';
import { StateViewComponent } from '../shared/state-view.component';
import { TaskItemComponent } from '../shared/task-item.component';

@Component({
  selector: 'app-event-detail',
  imports: [
    PageHeaderComponent,
    StateViewComponent,
    SectionHeaderComponent,
    TaskItemComponent,
    IonContent,
    IonButton,
    IonIcon,
  ],
  styles: `
    .hero {
      margin-top: 8px;
      padding: 18px;
      background: linear-gradient(160deg, var(--cat-soft), var(--ob-surface) 75%);
    }
    .hero-top {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .badge {
      display: grid;
      flex: none;
      place-items: center;
      width: 48px;
      height: 48px;
      border-radius: 15px;
      background: var(--cat-soft);
      color: var(--cat-ink);
      font-size: 24px;
    }
    .hero-top .kind {
      flex: 1;
      color: var(--cat-ink);
    }
    h1 {
      margin: 14px 0 6px;
      font-size: 1.625rem;
      line-height: 1.2;
      overflow-wrap: anywhere;
    }
    .when {
      margin: 0;
      font-weight: 600;
    }
    .chips {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-top: 12px;
    }
    .join {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      min-height: 44px;
      margin-top: 12px;
      font-weight: 600;
    }
    .block-info {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      margin: 14px 0 0;
      padding: 12px 14px;
      border-radius: var(--ob-radius-md);
      background: color-mix(in srgb, var(--ob-warn) 14%, var(--ob-surface));
      color: var(--ob-warn-ink);
      font-size: 0.9375rem;
      line-height: 1.4;
    }
    .block-info ion-icon {
      flex: none;
      margin-top: 2px;
      font-size: 20px;
    }
    .note {
      margin: 16px 0 0;
    }
    .note h3 {
      margin: 0 0 4px;
      font-size: 0.75rem;
    }
    .note p {
      margin: 0;
      white-space: pre-line;
      overflow-wrap: anywhere;
    }
    .actions {
      display: grid;
      gap: 10px;
      margin-top: 20px;
    }
    section.block {
      margin-top: 28px;
    }
    .hint {
      margin: 4px 0 8px;
      color: var(--ob-text-2);
    }
    .icon-btn {
      --padding-start: 0;
      --padding-end: 0;
      width: 44px;
      height: 44px;
      color: var(--ob-text-2);
    }
    .row-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin: 4px 0 12px;
    }
  `,
  template: `
    <app-page-header title="Événement" backHref="/app/aujourdhui" [showProfile]="false">
      <ion-button class="icon-btn" fill="clear" (click)="edit()" aria-label="Modifier l’événement">
        <ion-icon slot="icon-only" [icon]="icons.edit"></ion-icon>
      </ion-button>
      <ion-button class="icon-btn" fill="clear" (click)="remove()" aria-label="Supprimer l’événement">
        <ion-icon slot="icon-only" [icon]="icons.trash"></ion-icon>
      </ion-button>
    </app-page-header>
    <ion-content>
      <div class="ob-container">
        <app-state-view [loading]="loading()" [error]="error()" [hero]="true" (retry)="load()">
          @if (event(); as e) {
            <section class="hero ob-card ob-cat ob-cat--carriere ob-rise">
              <div class="hero-top">
                <span class="badge"><ion-icon [icon]="icon()" aria-hidden="true"></ion-icon></span>
                <p class="kind ob-eyebrow">{{ typeLabel() }}</p>
                @switch (e.status) {
                  @case ('REALISE') {
                    <span class="ob-chip ob-chip--ok"
                      ><ion-icon [icon]="icons.done" aria-hidden="true"></ion-icon>Réalisé</span
                    >
                  }
                  @case ('ANNULE') {
                    <span class="ob-chip"><ion-icon [icon]="icons.cancelled" aria-hidden="true"></ion-icon>Annulé</span>
                  }
                  @default {
                    <span class="ob-chip ob-chip--primary"
                      ><ion-icon [icon]="icons.calendar" aria-hidden="true"></ion-icon>Prévu</span
                    >
                  }
                }
              </div>
              <h1 class="ob-display">{{ e.title }}</h1>
              <p class="when">{{ day() }} · {{ e.startTime }} – {{ e.endTime }}</p>

              <div class="chips">
                @if (e.location) {
                  <span class="ob-chip"
                    ><ion-icon [icon]="icons.place" aria-hidden="true"></ion-icon>{{ e.location }}</span
                  >
                }
                @for (p of e.participants; track p) {
                  <span class="ob-chip">{{ p }}</span>
                }
              </div>

              @if (e.link) {
                <a class="join" [href]="e.link" target="_blank" rel="noopener noreferrer">
                  <ion-icon [icon]="icons.open" aria-hidden="true"></ion-icon>Ouvrir le lien de visio
                </a>
              }

              @if (e.blockedMinutes > 0) {
                <p class="block-info">
                  <ion-icon [icon]="icons.leave" aria-hidden="true"></ion-icon>
                  <span>
                    @if (e.travelBeforeMinutes > 0) {
                      Déplacement {{ minutes(e.travelBeforeMinutes) }}
                      @if (e.leaveAtTime) {
                        — pars à {{ e.leaveAtTime }}
                      }
                      .
                    }
                    @if (e.prepBeforeMinutes > 0) {
                      Préparation {{ minutes(e.prepBeforeMinutes) }}.
                    }
                    Temps réservé dès {{ e.blockedFromTime }}.
                  </span>
                </p>
              }

              @if (e.agenda) {
                <div class="note">
                  <h3 class="ob-eyebrow">Ordre du jour</h3>
                  <p>{{ e.agenda }}</p>
                </div>
              }
              @if (e.decisions) {
                <div class="note">
                  <h3 class="ob-eyebrow">Décisions</h3>
                  <p>{{ e.decisions }}</p>
                </div>
              }
            </section>

            <div class="actions">
              @if (e.status === 'PREVU') {
                <ion-button expand="block" (click)="complete()" [disabled]="busy()">Marquer comme réalisé</ion-button>
                <ion-button expand="block" fill="outline" color="medium" (click)="cancel()" [disabled]="busy()">
                  Annuler l’événement
                </ion-button>
              } @else {
                <ion-button expand="block" fill="outline" (click)="reopen()" [disabled]="busy()">Rouvrir</ion-button>
              }
            </div>

            <section class="block">
              <app-section-header title="Préparation et suivi" [count]="e.tasks.length" />
              <div class="row-actions">
                <ion-button class="ob-soft" size="small" (click)="addTask('PREPARATION')" [disabled]="busy()">
                  <ion-icon slot="start" [icon]="icons.add" aria-hidden="true"></ion-icon>Préparation
                </ion-button>
                <ion-button class="ob-soft" size="small" (click)="addTask('SUIVI')" [disabled]="busy()">
                  <ion-icon slot="start" [icon]="icons.add" aria-hidden="true"></ion-icon>Action de suivi
                </ion-button>
              </div>
              @for (t of e.tasks; track t.id; let i = $index) {
                <app-task-item [task]="t" [index]="i" (changed)="load()" />
              } @empty {
                <p class="hint">
                  Ajoute une tâche de préparation avant le rendez-vous, puis une action de suivi pour ne rien laisser en
                  suspens.
                </p>
              }
            </section>
            <div class="ob-fab-space"></div>
          }
        </app-state-view>
      </div>
    </ion-content>
  `,
})
export class EventDetailPage {
  private readonly api = inject(ApiService);
  private readonly alerts = inject(AlertController);
  private readonly modals = inject(ModalController);
  private readonly toasts = inject(ToastController);
  private readonly router = inject(Router);

  /** Paramètre de route `:id`. */
  readonly id = input.required<string>();

  protected readonly event = signal<CalendarEventDetail | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected readonly minutes = minutesLabel;
  protected readonly icons = {
    add,
    calendar: calendarOutline,
    done: checkmarkCircle,
    cancelled: closeCircleOutline,
    edit: createOutline,
    trash: trashOutline,
    place: locationOutline,
    open: openOutline,
    leave: walkOutline,
  };

  protected readonly icon = computed(() => eventIcon(this.event()?.type ?? 'REUNION'));
  protected readonly typeLabel = computed(() => EVENT_TYPE_LABELS[this.event()?.type ?? 'REUNION']);
  protected readonly day = computed(() => (this.event() ? longDate(this.event()!.date) : ''));

  ionViewWillEnter(): void {
    void this.load();
  }

  async load(): Promise<void> {
    this.error.set(null);
    try {
      this.event.set(await this.api.event(this.id()));
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'Chargement impossible');
    } finally {
      this.loading.set(false);
    }
  }

  protected async edit(): Promise<void> {
    const modal = await this.modals.create({ component: EventFormComponent, componentProps: { event: this.event() } });
    await modal.present();
    if ((await modal.onWillDismiss()).role === 'saved') await this.load();
  }

  protected async remove(): Promise<void> {
    const alert = await this.alerts.create({
      header: 'Supprimer cet événement ?',
      message: 'Les tâches de préparation et de suivi sont conservées.',
      buttons: [
        { text: 'Garder', role: 'cancel' },
        { text: 'Supprimer', role: 'destructive' },
      ],
    });
    await alert.present();
    if ((await alert.onWillDismiss()).role !== 'destructive') return;
    await this.run(async () => {
      await this.api.deleteEvent(this.id());
      await this.router.navigateByUrl('/app/aujourdhui', { replaceUrl: true });
    });
  }

  protected async complete(): Promise<void> {
    const e = this.event();
    if (!e) return;
    const alert = await this.alerts.create({
      header: 'Rendez-vous réalisé ?',
      message: 'Note les décisions prises, tu pourras les relire plus tard.',
      inputs: [
        {
          name: 'decisions',
          type: 'textarea',
          placeholder: 'Décisions prises (facultatif)',
          value: e.decisions ?? '',
          attributes: { maxlength: 2000, rows: 4 },
        },
      ],
      buttons: [
        { text: 'Pas encore', role: 'cancel' },
        { text: 'Réalisé', role: 'confirm' },
      ],
    });
    await alert.present();
    const { role, data } = await alert.onWillDismiss<{ values: { decisions: string } }>();
    if (role !== 'confirm') return;
    const decisions = data?.values.decisions.trim() || null;
    await this.run(async () => {
      await this.api.completeEvent(e.id, decisions);
      await this.load();
      await this.say('Bravo, rendez-vous réalisé ! Pense à l’action de suivi.');
    });
  }

  protected async cancel(): Promise<void> {
    const alert = await this.alerts.create({
      header: 'Annuler cet événement ?',
      message: 'Tu pourras le rouvrir plus tard si besoin.',
      buttons: [
        { text: 'Garder', role: 'cancel' },
        { text: 'Annuler l’événement', role: 'destructive' },
      ],
    });
    await alert.present();
    if ((await alert.onWillDismiss()).role !== 'destructive') return;
    await this.run(async () => {
      await this.api.cancelEvent(this.id());
      await this.load();
    });
  }

  protected async reopen(): Promise<void> {
    await this.run(async () => {
      await this.api.reopenEvent(this.id());
      await this.load();
    });
  }

  protected async addTask(role: EventTaskRole): Promise<void> {
    await this.run(async () => {
      await this.api.createEventTask(this.id(), { role });
      await this.load();
      await this.say(role === 'PREPARATION' ? 'Tâche de préparation ajoutée.' : 'Action de suivi ajoutée.');
    });
  }

  // `busy` bloque le double appui ; l'erreur du serveur est affichée telle quelle.
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
