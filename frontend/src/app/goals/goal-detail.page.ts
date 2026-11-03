import { Component, inject, input, signal } from '@angular/core';
import { Router } from '@angular/router';
import {
  AlertController,
  IonBackButton,
  IonButton,
  IonButtons,
  IonCheckbox,
  IonContent,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonListHeader,
  IonNote,
  IonProgressBar,
  IonTitle,
  IonToolbar,
  ModalController,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { createOutline, trashOutline } from 'ionicons/icons';

import { ApiService } from '../core/api.service';
import { localToday, shortDate } from '../core/dates';
import { CATEGORY_LABELS, GOAL_STATUS_LABELS, PRIORITY_LABELS, type GoalDetail, type Milestone } from '../core/models';
import { AddMenuService } from '../shared/add-menu.service';
import { GoalFormComponent } from '../shared/goal-form.component';
import { StateViewComponent } from '../shared/state-view.component';
import { TaskItemComponent } from '../shared/task-item.component';

@Component({
  selector: 'app-goal-detail',
  imports: [
    StateViewComponent,
    TaskItemComponent,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonBackButton,
    IonButton,
    IonIcon,
    IonContent,
    IonList,
    IonListHeader,
    IonItem,
    IonLabel,
    IonCheckbox,
    IonNote,
    IonProgressBar,
  ],
  styles: `
    .head {
      padding: 16px;
    }
    .head h1 {
      margin: 0 0 4px;
      font-size: 1.4rem;
    }
    .meta {
      color: var(--ion-color-medium);
      font-size: 0.9rem;
    }
    .motivation {
      font-style: italic;
    }
    ion-progress-bar {
      margin: 12px 0 4px;
    }
    .empty {
      padding: 8px 16px;
      color: var(--ion-color-medium);
    }
    ion-checkbox {
      margin-inline-end: 12px;
    }
    .done {
      text-decoration: line-through;
      color: var(--ion-color-medium);
    }
  `,
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start"
          ><ion-back-button defaultHref="/app/objectifs" text="Objectifs"></ion-back-button
        ></ion-buttons>
        <ion-title>Objectif</ion-title>
        <ion-buttons slot="end">
          <ion-button (click)="edit()" aria-label="Modifier"
            ><ion-icon slot="icon-only" name="create-outline"></ion-icon
          ></ion-button>
          <ion-button (click)="remove()" aria-label="Supprimer"
            ><ion-icon slot="icon-only" name="trash-outline"></ion-icon
          ></ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>
    <ion-content>
      <app-state-view [loading]="loading()" [error]="error()" (retry)="load()">
        @if (goal(); as g) {
          <div class="head">
            <h1>{{ g.title }}</h1>
            <div class="meta">
              {{ labels.category[g.category] }} · {{ labels.status[g.status] }} · priorité
              {{ labels.priority[g.priority].toLowerCase() }}
            </div>
            <div class="meta">Du {{ date(g.startDate) }} au {{ date(g.endDate) }}</div>
            @if (g.motivation) {
              <p class="motivation">« {{ g.motivation }} »</p>
            }
            @if (g.description) {
              <p>{{ g.description }}</p>
            }
            @if (g.progress.percent !== null) {
              <ion-progress-bar
                [value]="g.progress.percent / 100"
                [attr.aria-label]="g.progress.label"
              ></ion-progress-bar>
            }
            <ion-note>{{ g.progress.label }} — progression calculée par jalons.</ion-note>
          </div>

          <ion-list>
            <ion-list-header>
              <ion-label>Jalons</ion-label>
              <ion-button (click)="addMilestone()">Ajouter</ion-button>
            </ion-list-header>
            @for (m of g.milestones; track m.id) {
              <ion-item lines="full">
                <ion-checkbox
                  slot="start"
                  [checked]="m.completed"
                  (ionChange)="toggleMilestone(m)"
                  [attr.aria-label]="'Jalon terminé : ' + m.title"
                ></ion-checkbox>
                <ion-label class="ion-text-wrap">
                  <div [class.done]="m.completed">{{ m.title }}</div>
                  <ion-note>{{ m.dueDate ? 'pour le ' + date(m.dueDate) : 'sans date' }}</ion-note>
                </ion-label>
                <ion-button slot="end" fill="clear" size="small" (click)="planFor(m)">Planifier</ion-button>
              </ion-item>
            } @empty {
              <p class="empty">Ajoute un premier jalon, par exemple l'étape de ce mois-ci.</p>
            }
          </ion-list>

          <ion-list>
            <ion-list-header>
              <ion-label>Actions</ion-label>
              <ion-button (click)="planFor()">Ajouter</ion-button>
            </ion-list-header>
            @if (g.needsNextAction) {
              <p class="empty">Aucune prochaine action. Planifie la prochaine étape pour avancer.</p>
            }
            @for (t of g.tasks; track t.id) {
              <app-task-item [task]="t" (changed)="load()" />
            }
          </ion-list>
        }
      </app-state-view>
    </ion-content>
  `,
})
export class GoalDetailPage {
  private readonly api = inject(ApiService);
  private readonly alerts = inject(AlertController);
  private readonly modals = inject(ModalController);
  private readonly router = inject(Router);
  private readonly addMenu = inject(AddMenuService);

  /** Paramètre de route `:id`. */
  readonly id = input.required<string>();

  protected readonly goal = signal<GoalDetail | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly labels = { category: CATEGORY_LABELS, status: GOAL_STATUS_LABELS, priority: PRIORITY_LABELS };
  protected readonly date = shortDate;

  constructor() {
    addIcons({ createOutline, trashOutline });
  }

  ionViewWillEnter(): void {
    void this.load();
  }

  async load(): Promise<void> {
    this.error.set(null);
    try {
      this.goal.set(await this.api.goal(this.id()));
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'Chargement impossible');
    } finally {
      this.loading.set(false);
    }
  }

  protected async edit(): Promise<void> {
    const modal = await this.modals.create({ component: GoalFormComponent, componentProps: { goal: this.goal() } });
    await modal.present();
    if ((await modal.onWillDismiss()).role === 'saved') await this.load();
  }

  protected async remove(): Promise<void> {
    const alert = await this.alerts.create({
      header: 'Supprimer cet objectif ?',
      message: 'Ses jalons seront supprimés. Les tâches liées sont conservées, sans objectif.',
      buttons: [
        { text: 'Garder', role: 'cancel' },
        { text: 'Supprimer', role: 'destructive' },
      ],
    });
    await alert.present();
    if ((await alert.onWillDismiss()).role !== 'destructive') return;
    await this.api.deleteGoal(this.id());
    await this.router.navigateByUrl('/app/objectifs', { replaceUrl: true });
  }

  protected async addMilestone(): Promise<void> {
    const alert = await this.alerts.create({
      header: 'Nouveau jalon',
      inputs: [
        { name: 'title', placeholder: 'Ex. Réaliser la première démonstration', attributes: { maxlength: 120 } },
        { name: 'dueDate', type: 'date', value: localToday() },
      ],
      buttons: [
        { text: 'Fermer', role: 'cancel' },
        { text: 'Ajouter', role: 'confirm' },
      ],
    });
    await alert.present();
    const { role, data } = await alert.onWillDismiss<{ values: { title: string; dueDate: string } }>();
    const title = data?.values.title?.trim();
    if (role !== 'confirm' || !title) return;
    await this.api.createMilestone(this.id(), { title, dueDate: data!.values.dueDate || null });
    await this.load();
  }

  protected async toggleMilestone(m: Milestone): Promise<void> {
    await this.api.updateMilestone(m.id, { completed: !m.completed });
    await this.load();
  }

  protected planFor(m?: Milestone): void {
    void this.addMenu.openTask({ presetGoalId: this.id(), presetMilestoneId: m?.id ?? null }, () => void this.load());
  }
}
