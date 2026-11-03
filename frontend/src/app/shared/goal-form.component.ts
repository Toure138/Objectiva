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

import type { FieldError } from '../core/api-error';
import { ApiError } from '../core/api-error';
import { ApiService } from '../core/api.service';
import { addDays, localToday } from '../core/dates';
import {
  CATEGORY_LABELS,
  GOAL_STATUS_LABELS,
  HORIZON_LABELS,
  PRIORITY_LABELS,
  type Goal,
  type GoalCategory,
  type GoalHorizon,
  type GoalPriority,
  type GoalStatus,
} from '../core/models';

@Component({
  selector: 'app-goal-form',
  imports: [
    FormsModule,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonButton,
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
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start"><ion-button (click)="close()">Fermer</ion-button></ion-buttons>
        <ion-title>{{ goal ? 'Modifier l’objectif' : 'Nouvel objectif' }}</ion-title>
        <ion-buttons slot="end">
          <ion-button strong (click)="save()" [disabled]="saving() || !title.trim()">Enregistrer</ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>
    <ion-content class="ion-padding">
      <form (ngSubmit)="save()">
        <ion-list>
          <ion-item>
            <ion-input
              label="Ce que je veux accomplir"
              labelPlacement="stacked"
              [(ngModel)]="title"
              name="title"
              required
              [maxlength]="120"
              placeholder="Ex. Réussir ma certification"
            ></ion-input>
          </ion-item>
          <ion-item>
            <ion-select
              label="Catégorie"
              labelPlacement="stacked"
              [(ngModel)]="category"
              name="category"
              interface="action-sheet"
            >
              @for (c of categories; track c[0]) {
                <ion-select-option [value]="c[0]">{{ c[1] }}</ion-select-option>
              }
            </ion-select>
          </ion-item>
          <ion-item>
            <ion-input
              label="Début"
              labelPlacement="stacked"
              type="date"
              [(ngModel)]="startDate"
              name="startDate"
            ></ion-input>
          </ion-item>
          <ion-item>
            <ion-input
              label="Échéance"
              labelPlacement="stacked"
              type="date"
              [(ngModel)]="endDate"
              name="endDate"
            ></ion-input>
          </ion-item>
          @if (fieldError('endDate'); as msg) {
            <ion-note color="danger" class="ion-padding-start">{{ msg }}</ion-note>
          }
        </ion-list>

        <ion-accordion-group>
          <ion-accordion value="avance">
            <ion-item slot="header"><ion-label>Plus d'options</ion-label></ion-item>
            <ion-list slot="content">
              <ion-item>
                <ion-select
                  label="Horizon"
                  labelPlacement="stacked"
                  [(ngModel)]="horizon"
                  name="horizon"
                  interface="action-sheet"
                >
                  @for (h of horizons; track h[0]) {
                    <ion-select-option [value]="h[0]">{{ h[1] }}</ion-select-option>
                  }
                </ion-select>
              </ion-item>
              <ion-item>
                <ion-select
                  label="Priorité"
                  labelPlacement="stacked"
                  [(ngModel)]="priority"
                  name="priority"
                  interface="action-sheet"
                >
                  @for (p of priorities; track p[0]) {
                    <ion-select-option [value]="p[0]">{{ p[1] }}</ion-select-option>
                  }
                </ion-select>
              </ion-item>
              <ion-item>
                <ion-select
                  label="Statut"
                  labelPlacement="stacked"
                  [(ngModel)]="status"
                  name="status"
                  interface="action-sheet"
                >
                  @for (s of statuses; track s[0]) {
                    <ion-select-option [value]="s[0]">{{ s[1] }}</ion-select-option>
                  }
                </ion-select>
              </ion-item>
              <ion-item>
                <ion-textarea
                  label="Description"
                  labelPlacement="stacked"
                  [(ngModel)]="description"
                  name="description"
                  [autoGrow]="true"
                  [maxlength]="2000"
                ></ion-textarea>
              </ion-item>
              <ion-item>
                <ion-textarea
                  label="Pourquoi c'est important pour moi"
                  labelPlacement="stacked"
                  [(ngModel)]="motivation"
                  name="motivation"
                  [autoGrow]="true"
                  [maxlength]="500"
                ></ion-textarea>
              </ion-item>
            </ion-list>
          </ion-accordion>
        </ion-accordion-group>

        <ion-note class="ion-padding-start">Progression : suivie par jalons (jalons terminés sur le total).</ion-note>
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
export class GoalFormComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly modalCtrl = inject(ModalController);

  /** Objectif à modifier ; absent pour une création. */
  // `@Input()` classique : Ionic affecte `componentProps` directement (voir task-form).
  @Input() goal: Goal | null = null;

  protected readonly categories = Object.entries(CATEGORY_LABELS);
  protected readonly horizons = Object.entries(HORIZON_LABELS);
  protected readonly priorities = Object.entries(PRIORITY_LABELS);
  protected readonly statuses = Object.entries(GOAL_STATUS_LABELS);

  protected title = '';
  protected category: GoalCategory = 'PROJET_PERSONNEL';
  protected horizon: GoalHorizon = 'TRIMESTRE';
  protected priority: GoalPriority = 'MOYENNE';
  protected status: GoalStatus = 'A_DEMARRER';
  protected startDate = localToday();
  protected endDate = addDays(localToday(), 90);
  protected description = '';
  protected motivation = '';

  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);
  private readonly fields = signal<FieldError[]>([]);

  ngOnInit(): void {
    const g = this.goal;
    if (!g) return;
    Object.assign(this, {
      title: g.title,
      category: g.category,
      horizon: g.horizon,
      priority: g.priority,
      status: g.status,
      startDate: g.startDate,
      endDate: g.endDate,
      description: g.description ?? '',
      motivation: g.motivation ?? '',
    });
  }

  protected fieldError(field: string): string | undefined {
    return this.fields().find((f) => f.field === field)?.message;
  }

  protected close(): void {
    void this.modalCtrl.dismiss(null, 'cancel');
  }

  protected async save(): Promise<void> {
    if (this.saving() || !this.title.trim()) return;
    this.saving.set(true);
    this.error.set(null);
    this.fields.set([]);
    const body = {
      title: this.title.trim(),
      category: this.category,
      horizon: this.horizon,
      priority: this.priority,
      status: this.status,
      startDate: this.startDate,
      endDate: this.endDate,
      description: this.description.trim() || null,
      motivation: this.motivation.trim() || null,
    };
    try {
      const g = this.goal;
      const saved = g ? await this.api.updateGoal(g.id, body) : await this.api.createGoal(body);
      await this.modalCtrl.dismiss(saved, 'saved');
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'Échec de l’enregistrement');
      if (e instanceof ApiError) this.fields.set(e.fields);
      this.saving.set(false);
    }
  }
}
