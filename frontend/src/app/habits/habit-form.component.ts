import type { OnInit } from '@angular/core';
import { Component, Input, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonInput,
  IonItem,
  IonList,
  IonNote,
  IonSelect,
  IonSelectOption,
  IonText,
  IonTitle,
  IonToolbar,
  ModalController,
} from '@ionic/angular';
import { close } from 'ionicons/icons';

import type { FieldError } from '../core/api-error';
import { ApiError } from '../core/api-error';
import { ApiService } from '../core/api.service';
import { localToday } from '../core/dates';
import type { Goal, Habit } from '../core/models';
import { WEEKDAYS } from '../core/repeat';

type Mode = 'daily' | 'weekdays' | 'custom' | 'perweek';
const ALL = [1, 2, 3, 4, 5, 6, 7];
const WORK = [1, 2, 3, 4, 5];

/** Création ou modification d'une habitude (spec 012). Changer de fréquence vaut « à partir du » jour choisi. */
@Component({
  selector: 'app-habit-form',
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
    IonSelect,
    IonSelectOption,
    IonNote,
    IonText,
  ],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-button (click)="dismiss()" aria-label="Fermer">
            <ion-icon slot="icon-only" [icon]="closeIcon"></ion-icon>
          </ion-button>
        </ion-buttons>
        <ion-title>{{ habit ? 'Modifier l’habitude' : 'Habitude' }}</ion-title>
        <ion-buttons slot="end">
          <ion-button strong (click)="save()" [disabled]="saving() || !title.trim()">Enregistrer</ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>
    <ion-content class="ion-padding">
      <form (ngSubmit)="save()">
        <ion-list class="ob-form" lines="none">
          <ion-item>
            <ion-input
              label="Habitude"
              labelPlacement="stacked"
              [(ngModel)]="title"
              name="title"
              required
              [maxlength]="120"
              placeholder="Ex. Lire 20 pages"
            ></ion-input>
          </ion-item>
          @if (fieldError('title'); as msg) {
            <ion-note color="danger" class="ion-padding-start">{{ msg }}</ion-note>
          }
          <ion-item>
            <ion-select
              label="Fréquence"
              labelPlacement="stacked"
              [(ngModel)]="mode"
              name="mode"
              interface="action-sheet"
            >
              <ion-select-option value="daily">Chaque jour</ion-select-option>
              <ion-select-option value="weekdays">En semaine (lun.–ven.)</ion-select-option>
              <ion-select-option value="custom">Jours choisis</ion-select-option>
              <ion-select-option value="perweek">Plusieurs fois par semaine</ion-select-option>
            </ion-select>
          </ion-item>
          @if (mode === 'custom') {
            <div class="ob-days" role="group" aria-label="Jours de l’habitude">
              @for (d of weekdays; track d.day) {
                <button
                  type="button"
                  [class.on]="days.includes(d.day)"
                  [attr.aria-pressed]="days.includes(d.day)"
                  [attr.aria-label]="d.long"
                  (click)="toggleDay(d.day)"
                >
                  {{ d.short }}
                </button>
              }
            </div>
          }
          @if (mode === 'perweek') {
            <ion-item>
              <ion-select
                label="Combien de fois"
                labelPlacement="stacked"
                [(ngModel)]="times"
                name="times"
                interface="action-sheet"
              >
                @for (n of counts; track n) {
                  <ion-select-option [value]="n">{{ n }} fois par semaine</ion-select-option>
                }
              </ion-select>
            </ion-item>
          }
          @if (fieldError('kind'); as msg) {
            <ion-note color="danger" class="ion-padding-start">{{ msg }}</ion-note>
          }
          @if (!habit) {
            <ion-item>
              <ion-input
                label="Je commence le"
                labelPlacement="stacked"
                type="date"
                [(ngModel)]="startDate"
                name="startDate"
              ></ion-input>
            </ion-item>
          } @else if (frequencyChanged()) {
            <ion-item>
              <ion-input
                label="Nouvelle fréquence à partir du"
                labelPlacement="stacked"
                type="date"
                [(ngModel)]="from"
                name="from"
              ></ion-input>
            </ion-item>
            <ion-note class="ion-padding-start"
              >Les jours précédents gardent l’ancienne fréquence : ta série reste juste.</ion-note
            >
            @if (fieldError('from'); as msg) {
              <ion-note color="danger" class="ion-padding-start">{{ msg }}</ion-note>
            }
          }
          @if (goals().length > 0) {
            <ion-item>
              <ion-select
                label="Objectif lié"
                labelPlacement="stacked"
                [(ngModel)]="goalId"
                name="goalId"
                placeholder="Aucun"
                interface="action-sheet"
              >
                <ion-select-option [value]="null">Aucun</ion-select-option>
                @for (g of goals(); track g.id) {
                  <ion-select-option [value]="g.id">{{ g.title }}</ion-select-option>
                }
              </ion-select>
            </ion-item>
          }
        </ion-list>
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
export class HabitFormComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly modalCtrl = inject(ModalController);

  // `@Input()` classiques : Ionic affecte `componentProps` directement.
  @Input() habit: Habit | null = null;
  @Input() presetGoalId: string | null = null;

  protected readonly closeIcon = close;
  protected readonly weekdays = WEEKDAYS;
  protected readonly counts = [1, 2, 3, 4, 5, 6, 7];

  protected title = '';
  protected mode: Mode = 'daily';
  protected days: number[] = [];
  protected times = 3;
  protected startDate = localToday();
  protected from = localToday();
  protected goalId: string | null = null;

  protected readonly goals = signal<Goal[]>([]);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);
  private readonly fields = signal<FieldError[]>([]);
  private initialFrequency = '';

  async ngOnInit(): Promise<void> {
    const h = this.habit;
    if (h) {
      this.title = h.title;
      this.goalId = h.goalId;
      if (h.kind === 'SEMAINE') {
        this.mode = 'perweek';
        this.times = h.timesPerWeek ?? 3;
      } else {
        this.days = [...h.weekdays];
        this.mode = same(h.weekdays, ALL) ? 'daily' : same(h.weekdays, WORK) ? 'weekdays' : 'custom';
      }
      this.initialFrequency = JSON.stringify(this.frequency());
    } else {
      this.goalId = this.presetGoalId;
    }
    try {
      this.goals.set(
        (await this.api.goals()).filter(
          (g) => g.status === 'A_DEMARRER' || g.status === 'EN_COURS' || g.id === this.goalId,
        ),
      );
    } catch {
      // L'habitude reste créable sans la liste des objectifs.
    }
  }

  protected toggleDay(day: number): void {
    this.days = this.days.includes(day) ? this.days.filter((d) => d !== day) : [...this.days, day];
  }

  protected frequencyChanged(): boolean {
    return this.habit !== null && JSON.stringify(this.frequency()) !== this.initialFrequency;
  }

  protected fieldError(field: string): string | undefined {
    return this.fields().find((f) => f.field === field)?.message;
  }

  protected dismiss(): void {
    void this.modalCtrl.dismiss(null, 'cancel');
  }

  private frequency(): { kind: 'JOURS' | 'SEMAINE'; weekdays?: number[]; timesPerWeek?: number } {
    switch (this.mode) {
      case 'perweek':
        return { kind: 'SEMAINE', timesPerWeek: this.times };
      case 'weekdays':
        return { kind: 'JOURS', weekdays: WORK };
      case 'custom':
        return { kind: 'JOURS', weekdays: [...this.days].sort((a, b) => a - b) };
      default:
        return { kind: 'JOURS', weekdays: ALL };
    }
  }

  protected async save(): Promise<void> {
    if (this.saving() || !this.title.trim()) return;
    this.saving.set(true);
    this.error.set(null);
    this.fields.set([]);
    try {
      const h = this.habit;
      let saved: Habit | null;
      if (!h) {
        saved = await this.api.createHabit({
          title: this.title.trim(),
          goalId: this.goalId,
          startDate: this.startDate,
          ...this.frequency(),
        });
      } else {
        // Seuls les changements partent : la synchronisation n'écrase rien d'autre.
        const patch: Record<string, unknown> = {};
        if (this.title.trim() !== h.title) patch['title'] = this.title.trim();
        if (this.goalId !== h.goalId) patch['goalId'] = this.goalId;
        if (this.frequencyChanged()) Object.assign(patch, this.frequency(), { from: this.from });
        saved = Object.keys(patch).length > 0 ? await this.api.updateHabit(h.id, patch) : null;
      }
      await this.modalCtrl.dismiss(saved, saved ? 'saved' : 'cancel');
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Échec de l’enregistrement');
      if (err instanceof ApiError) this.fields.set(err.fields);
      this.saving.set(false);
    }
  }
}

const same = (a: readonly number[], b: readonly number[]): boolean =>
  a.length === b.length && a.every((d, i) => d === b[i]);
