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
  IonSelect,
  IonSelectOption,
  IonText,
  IonTextarea,
  IonTitle,
  IonToolbar,
  ModalController,
} from '@ionic/angular';
import { close } from 'ionicons/icons';

import { ApiService } from '../core/api.service';
import { localToday } from '../core/dates';
import type { Goal, Milestone } from '../core/models';

/** Création rapide d'une tâche : seul le titre est obligatoire. */
@Component({
  selector: 'app-task-form',
  imports: [
    FormsModule,
    IonHeader,
    IonIcon,
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
  ],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-button (click)="close()" aria-label="Fermer">
            <ion-icon slot="icon-only" [icon]="closeIcon"></ion-icon>
          </ion-button>
        </ion-buttons>
        <ion-title>Nouvelle tâche</ion-title>
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
              label="Titre"
              labelPlacement="stacked"
              [(ngModel)]="title"
              name="title"
              required
              placeholder="Ex. Préparer les comptes de démonstration"
              [maxlength]="160"
            ></ion-input>
          </ion-item>
          <ion-item>
            <ion-input
              label="Je prévois d'y travailler le"
              labelPlacement="stacked"
              type="date"
              [(ngModel)]="workDate"
              name="workDate"
            ></ion-input>
          </ion-item>
          <ion-item>
            <ion-select
              label="Objectif"
              labelPlacement="stacked"
              [(ngModel)]="goalId"
              name="goalId"
              (ionChange)="loadMilestones()"
              placeholder="Aucun (tâche indépendante)"
              interface="action-sheet"
            >
              <ion-select-option [value]="null">Aucun</ion-select-option>
              @for (g of goals(); track g.id) {
                <ion-select-option [value]="g.id">{{ g.title }}</ion-select-option>
              }
            </ion-select>
          </ion-item>
        </ion-list>

        <ion-accordion-group>
          <ion-accordion value="avance">
            <ion-item slot="header"><ion-label>Plus d'options</ion-label></ion-item>
            <ion-list class="ob-form" lines="none" slot="content">
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
              <ion-item>
                <ion-input
                  label="Date limite"
                  labelPlacement="stacked"
                  type="date"
                  [(ngModel)]="dueDate"
                  name="dueDate"
                ></ion-input>
              </ion-item>
              <ion-item>
                <ion-textarea
                  label="Notes"
                  labelPlacement="stacked"
                  [(ngModel)]="notes"
                  name="notes"
                  [autoGrow]="true"
                  [maxlength]="2000"
                ></ion-textarea>
              </ion-item>
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
export class TaskFormComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly modalCtrl = inject(ModalController);

  protected readonly closeIcon = close;

  /** Préremplissage depuis un objectif, un jalon ou le bilan. */
  // `@Input()` classiques : Ionic affecte `componentProps` directement aux propriétés,
  // ce qui écraserait des entrées de type signal.
  @Input() presetGoalId: string | null = null;
  @Input() presetMilestoneId: string | null = null;
  @Input() presetDate: string | null = localToday();
  @Input() presetTitle = '';

  protected title = '';
  protected workDate: string | null = null;
  protected dueDate: string | null = null;
  protected notes = '';
  protected goalId: string | null = null;
  protected milestoneId: string | null = null;

  protected readonly goals = signal<Goal[]>([]);
  protected readonly milestones = signal<Milestone[]>([]);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  async ngOnInit(): Promise<void> {
    this.title = this.presetTitle;
    this.workDate = this.presetDate;
    this.goalId = this.presetGoalId;
    this.milestoneId = this.presetMilestoneId;
    try {
      this.goals.set((await this.api.goals()).filter((g) => g.status === 'A_DEMARRER' || g.status === 'EN_COURS'));
      if (this.goalId) await this.loadMilestones(false);
    } catch {
      // La tâche reste créable sans la liste des objectifs.
    }
  }

  protected async loadMilestones(reset = true): Promise<void> {
    if (reset) this.milestoneId = null;
    this.milestones.set(this.goalId ? (await this.api.goal(this.goalId)).milestones.filter((m) => !m.completed) : []);
  }

  protected close(): void {
    void this.modalCtrl.dismiss(null, 'cancel');
  }

  protected async save(): Promise<void> {
    if (this.saving() || !this.title.trim()) return;
    this.saving.set(true);
    this.error.set(null);
    try {
      const task = await this.api.createTask({
        title: this.title.trim(),
        workDate: this.workDate || null,
        dueDate: this.dueDate || null,
        notes: this.notes.trim() || null,
        goalId: this.goalId,
        milestoneId: this.milestoneId,
      });
      await this.modalCtrl.dismiss(task, 'saved');
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'Échec de l’enregistrement');
      this.saving.set(false);
    }
  }
}
