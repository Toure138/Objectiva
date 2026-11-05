import type { OnInit } from '@angular/core';
import { Component, Input, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  IonAccordion,
  IonAccordionGroup,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonInput,
  IonItem,
  IonLabel,
  IonList,
  IonNote,
  IonSelect,
  IonSelectOption,
  IonText,
  IonTextarea,
  IonTitle,
  IonToolbar,
  ModalController,
} from '@ionic/angular';
import { close } from 'ionicons/icons';

import type { FieldError } from '../core/api-error';
import { ApiError } from '../core/api-error';
import { ApiService } from '../core/api.service';
import { localToday } from '../core/dates';
import { EVENT_TYPE_LABELS, type CalendarEvent, type EventType, type Goal, type Milestone } from '../core/models';
import { modeOf, REPEAT_MODES, weekdaysFor, WEEKDAYS, type RepeatMode } from '../core/repeat';

/** Durées proposées pour le déplacement et la préparation. */
const MINUTES = [0, 15, 30, 45, 60, 90, 120, 180];

export function minutesLabel(m: number): string {
  if (m === 0) return 'Aucun';
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest ? `${h} h ${rest}` : `${h} h`;
}

/** Ajoute une heure à « HH:mm », sans dépasser 23:59. */
function plusHour(time: string): string {
  const [h, m] = time.split(':').map(Number) as [number, number];
  return h >= 23 ? '23:59' : `${String(h + 1).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Création ou modification d'un événement : titre, jour et heures suffisent. */
@Component({
  selector: 'app-event-form',
  imports: [
    FormsModule,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonButton,
    IonIcon,
    IonContent,
    IonList,
    IonItem,
    IonInput,
    IonTextarea,
    IonSelect,
    IonSelectOption,
    IonAccordionGroup,
    IonAccordion,
    IonLabel,
    IonText,
    IonNote,
  ],
  styles: `
    .pair {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0 12px;
    }
  `,
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-button (click)="dismiss()" aria-label="Fermer">
            <ion-icon slot="icon-only" [icon]="closeIcon"></ion-icon>
          </ion-button>
        </ion-buttons>
        <ion-title>{{ heading() }}</ion-title>
        <ion-buttons slot="end">
          <ion-button strong (click)="save()" [disabled]="saving() || !title.trim()">Enregistrer</ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>
    <ion-content class="ion-padding">
      <form (ngSubmit)="save()">
        <ion-list class="ob-form" lines="none">
          <ion-item>
            <ion-select label="Type" labelPlacement="stacked" [(ngModel)]="type" name="type" interface="action-sheet">
              @for (t of types; track t[0]) {
                <ion-select-option [value]="t[0]">{{ t[1] }}</ion-select-option>
              }
            </ion-select>
          </ion-item>
          <ion-item>
            <ion-input
              label="Titre"
              labelPlacement="stacked"
              [(ngModel)]="title"
              name="title"
              required
              [maxlength]="160"
              placeholder="Ex. Démonstration au collège Les Palmiers"
            ></ion-input>
          </ion-item>
          @if (following) {
            <ion-note class="ion-padding-start"
              >Chaque occurrence garde son jour ; tes changements s’appliquent à partir du {{ fromLabel() }}.</ion-note
            >
          } @else {
            <ion-item>
              <ion-input label="Jour" labelPlacement="stacked" type="date" [(ngModel)]="date" name="date"></ion-input>
            </ion-item>
          }
          <div class="pair">
            <ion-item>
              <ion-input
                label="Début"
                labelPlacement="stacked"
                type="time"
                [(ngModel)]="startTime"
                (ionChange)="startChanged()"
                name="startTime"
              ></ion-input>
            </ion-item>
            <ion-item>
              <ion-input
                label="Fin"
                labelPlacement="stacked"
                type="time"
                [(ngModel)]="endTime"
                name="endTime"
              ></ion-input>
            </ion-item>
          </div>
          @if (fieldError('endTime'); as msg) {
            <ion-note color="danger" class="ion-padding-start">{{ msg }}</ion-note>
          }
          @if (canRepeat()) {
            <ion-item>
              <ion-select
                label="Répéter"
                labelPlacement="stacked"
                [(ngModel)]="repeatMode"
                name="repeatMode"
                interface="action-sheet"
              >
                @for (m of repeatModes; track m[0]) {
                  @if (m[0] !== 'none' || !following) {
                    <ion-select-option [value]="m[0]">{{ m[1] }}</ion-select-option>
                  }
                }
              </ion-select>
            </ion-item>
            @if (repeatMode === 'custom') {
              <div class="ob-days" role="group" aria-label="Jours de la réunion">
                @for (d of weekdays; track d.day) {
                  <button
                    type="button"
                    [class.on]="customDays.includes(d.day)"
                    [attr.aria-pressed]="customDays.includes(d.day)"
                    [attr.aria-label]="d.long"
                    (click)="toggleDay(d.day)"
                  >
                    {{ d.short }}
                  </button>
                }
              </div>
            }
            @if (fieldError('repeat.weekdays'); as msg) {
              <ion-note color="danger" class="ion-padding-start">{{ msg }}</ion-note>
            }
            @if (repeatMode !== 'none') {
              <ion-item>
                <ion-input
                  label="Jusqu’au (facultatif)"
                  labelPlacement="stacked"
                  type="date"
                  [(ngModel)]="until"
                  name="until"
                ></ion-input>
              </ion-item>
              @if (fieldError('repeat.until'); as msg) {
                <ion-note color="danger" class="ion-padding-start">{{ msg }}</ion-note>
              }
            }
          }
          <ion-item>
            <ion-input
              label="Lieu"
              labelPlacement="stacked"
              [(ngModel)]="location"
              name="location"
              [maxlength]="200"
              placeholder="Adresse, salle…"
            ></ion-input>
          </ion-item>
          <ion-item>
            <ion-input
              label="Lien de visio"
              labelPlacement="stacked"
              type="url"
              inputmode="url"
              [(ngModel)]="link"
              name="link"
              [maxlength]="500"
              placeholder="https://…"
            ></ion-input>
          </ion-item>
          @if (fieldError('link'); as msg) {
            <ion-note color="danger" class="ion-padding-start">{{ msg }}</ion-note>
          }
        </ion-list>

        <ion-accordion-group>
          <ion-accordion value="avance">
            <ion-item slot="header"><ion-label>Plus d'options</ion-label></ion-item>
            <ion-list class="ob-form" lines="none" slot="content">
              <ion-item>
                <ion-textarea
                  label="Participants (un par ligne)"
                  labelPlacement="stacked"
                  [(ngModel)]="participants"
                  name="participants"
                  [autoGrow]="true"
                  placeholder="M. Koné (directeur)"
                ></ion-textarea>
              </ion-item>
              @if (fieldError('participants'); as msg) {
                <ion-note color="danger" class="ion-padding-start">{{ msg }}</ion-note>
              }
              <ion-item>
                <ion-textarea
                  label="Ordre du jour"
                  labelPlacement="stacked"
                  [(ngModel)]="agenda"
                  name="agenda"
                  [autoGrow]="true"
                  [maxlength]="2000"
                ></ion-textarea>
              </ion-item>
              <div class="pair">
                <ion-item>
                  <ion-select
                    label="Déplacement avant"
                    labelPlacement="stacked"
                    [(ngModel)]="travel"
                    name="travel"
                    interface="action-sheet"
                  >
                    @for (m of minutes; track m) {
                      <ion-select-option [value]="m">{{ label(m) }}</ion-select-option>
                    }
                  </ion-select>
                </ion-item>
                <ion-item>
                  <ion-select
                    label="Préparation avant"
                    labelPlacement="stacked"
                    [(ngModel)]="prep"
                    name="prep"
                    interface="action-sheet"
                  >
                    @for (m of minutes; track m) {
                      <ion-select-option [value]="m">{{ label(m) }}</ion-select-option>
                    }
                  </ion-select>
                </ion-item>
              </div>
              <ion-item>
                <ion-select
                  label="Objectif lié"
                  labelPlacement="stacked"
                  [(ngModel)]="goalId"
                  name="goalId"
                  (ionChange)="loadMilestones()"
                  placeholder="Aucun"
                  interface="action-sheet"
                >
                  <ion-select-option [value]="null">Aucun</ion-select-option>
                  @for (g of goals(); track g.id) {
                    <ion-select-option [value]="g.id">{{ g.title }}</ion-select-option>
                  }
                </ion-select>
              </ion-item>
              @if (milestones().length > 0) {
                <ion-item>
                  <ion-select
                    label="Jalon"
                    labelPlacement="stacked"
                    [(ngModel)]="milestoneId"
                    name="milestoneId"
                    placeholder="Aucun"
                    interface="action-sheet"
                  >
                    <ion-select-option [value]="null">Aucun</ion-select-option>
                    @for (m of milestones(); track m.id) {
                      <ion-select-option [value]="m.id">{{ m.title }}</ion-select-option>
                    }
                  </ion-select>
                </ion-item>
              }
            </ion-list>
          </ion-accordion>
        </ion-accordion-group>

        @if (error()) {
          <ion-text color="danger"
            ><p role="alert">{{ error() }}</p></ion-text
          >
        }
        <ion-button expand="block" type="submit" class="ion-margin-top" [disabled]="saving() || !title.trim()">
          Enregistrer
        </ion-button>
      </form>
    </ion-content>
  `,
})
export class EventFormComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly modalCtrl = inject(ModalController);

  // `@Input()` classiques : Ionic affecte `componentProps` directement (voir task-form).
  @Input() event: CalendarEvent | null = null;
  @Input() presetDate: string | null = null;
  @Input() presetGoalId: string | null = null;
  @Input() presetMilestoneId: string | null = null;
  /** Occurrence d'une réunion récurrente : modifier cette occurrence seule ou aussi les suivantes. */
  @Input() scope: 'occurrence' | 'following' = 'occurrence';

  protected readonly closeIcon = close;
  protected readonly types = Object.entries(EVENT_TYPE_LABELS);
  protected readonly minutes = MINUTES;
  protected readonly label = minutesLabel;
  protected readonly repeatModes = REPEAT_MODES;
  protected readonly weekdays = WEEKDAYS;

  protected type: EventType = 'REUNION';
  protected title = '';
  protected date = localToday();
  protected startTime = '09:00';
  protected endTime = '10:00';
  protected location = '';
  protected link = '';
  protected participants = '';
  protected agenda = '';
  protected travel = 0;
  protected prep = 0;
  protected goalId: string | null = null;
  protected milestoneId: string | null = null;
  protected repeatMode: RepeatMode = 'none';
  protected customDays: number[] = [];
  protected until = '';

  /** Valeurs à l'ouverture : en modification, seuls les champs changés sont envoyés. */
  private initial: Record<string, unknown> | null = null;
  private initialRepeat: { weekdays: number[]; until: string } | null = null;

  protected readonly goals = signal<Goal[]>([]);
  protected readonly milestones = signal<Milestone[]>([]);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);
  private readonly fields = signal<FieldError[]>([]);

  async ngOnInit(): Promise<void> {
    const e = this.event;
    if (e) {
      Object.assign(this, {
        type: e.type,
        title: e.title,
        date: e.date,
        startTime: e.startTime,
        endTime: e.endTime,
        location: e.location ?? '',
        link: e.link ?? '',
        participants: e.participants.join('\n'),
        agenda: e.agenda ?? '',
        travel: e.travelBeforeMinutes,
        prep: e.prepBeforeMinutes,
        goalId: e.goalId,
        milestoneId: e.milestoneId,
      });
      if (e.repeat && this.following) {
        this.repeatMode = modeOf(e.repeat.weekdays, e.repeat.startDate);
        this.customDays = [...e.repeat.weekdays];
        this.until = e.repeat.until ?? '';
        this.initialRepeat = { weekdays: [...e.repeat.weekdays], until: this.until };
      }
      this.initial = this.fieldsBody();
    } else {
      this.date = this.presetDate ?? localToday();
      this.goalId = this.presetGoalId;
      this.milestoneId = this.presetMilestoneId;
    }
    try {
      this.goals.set(
        (await this.api.goals()).filter(
          (g) => g.status === 'A_DEMARRER' || g.status === 'EN_COURS' || g.id === this.goalId,
        ),
      );
      if (this.goalId) await this.loadMilestones(false);
    } catch {
      // L'événement reste créable sans la liste des objectifs.
    }
  }

  /** Modification de « cette occurrence et les suivantes ». */
  protected get following(): boolean {
    return this.event !== null && this.event.seriesId !== null && this.scope === 'following';
  }

  protected canRepeat(): boolean {
    return this.event === null || this.following;
  }

  protected heading(): string {
    if (!this.event) return 'Événement';
    return this.following ? 'Modifier la suite' : 'Modifier';
  }

  protected fromLabel(): string {
    return new Date(`${this.event?.occurrenceDate ?? this.date}T12:00:00Z`).toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'long',
      timeZone: 'UTC',
    });
  }

  protected toggleDay(day: number): void {
    this.customDays = this.customDays.includes(day)
      ? this.customDays.filter((d) => d !== day)
      : [...this.customDays, day];
  }

  protected async loadMilestones(reset = true): Promise<void> {
    if (reset) this.milestoneId = null;
    this.milestones.set(this.goalId ? (await this.api.goal(this.goalId)).milestones.filter((m) => !m.completed) : []);
  }

  // Garde une fin cohérente quand le début avance (durée d'une heure par défaut).
  protected startChanged(): void {
    if (this.startTime && this.endTime <= this.startTime) this.endTime = plusHour(this.startTime);
  }

  protected fieldError(field: string): string | undefined {
    return this.fields().find((f) => f.field === field)?.message;
  }

  protected dismiss(): void {
    void this.modalCtrl.dismiss(null, 'cancel');
  }

  protected async save(): Promise<void> {
    if (this.saving() || !this.title.trim()) return;
    this.saving.set(true);
    this.error.set(null);
    this.fields.set([]);
    try {
      const e = this.event;
      const saved = e ? await this.update(e) : await this.api.createEvent(this.createBody());
      await this.modalCtrl.dismiss(saved, saved ? 'saved' : 'cancel');
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Échec de l’enregistrement');
      if (err instanceof ApiError) this.fields.set(err.fields);
      this.saving.set(false);
    }
  }

  private createBody(): Record<string, unknown> {
    const body: Record<string, unknown> = this.fieldsBody();
    if (this.repeatMode !== 'none') {
      body['repeat'] = {
        weekdays: weekdaysFor(this.repeatMode, this.date, this.customDays),
        until: this.until || null,
      };
    }
    return body;
  }

  /** N'envoie que ce qui a changé : indispensable pour « et les suivantes », et la synchronisation y gagne. */
  private async update(e: CalendarEvent): Promise<CalendarEvent | null> {
    const now = this.fieldsBody();
    const patch: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(now)) {
      if (JSON.stringify(value) !== JSON.stringify(this.initial?.[key])) patch[key] = value;
    }
    if (this.following) {
      delete patch['date'];
      const weekdays = weekdaysFor(this.repeatMode, e.repeat?.startDate ?? this.date, this.customDays);
      const repeat: Record<string, unknown> = {};
      if (JSON.stringify(weekdays) !== JSON.stringify(this.initialRepeat?.weekdays)) repeat['weekdays'] = weekdays;
      if (this.until !== this.initialRepeat?.until) repeat['until'] = this.until || null;
      if (Object.keys(repeat).length > 0) patch['repeat'] = repeat;
    }
    if (Object.keys(patch).length === 0) return null;
    return this.api.updateEvent(e.id, patch, this.following ? 'following' : 'occurrence');
  }

  private fieldsBody(): Record<string, unknown> {
    return {
      type: this.type,
      title: this.title.trim(),
      date: this.date,
      startTime: this.startTime,
      endTime: this.endTime,
      location: this.location.trim() || null,
      link: this.link.trim() || null,
      participants: this.participants
        .split(/[\n,]/)
        .map((p) => p.trim())
        .filter(Boolean),
      agenda: this.agenda.trim() || null,
      travelBeforeMinutes: this.travel,
      prepBeforeMinutes: this.prep,
      goalId: this.goalId,
      milestoneId: this.milestoneId,
    };
  }
}
