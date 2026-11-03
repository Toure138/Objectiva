import { Component, inject, input, signal } from '@angular/core';
import { Router } from '@angular/router';
import {
  AlertController,
  IonButton,
  IonCheckbox,
  IonContent,
  IonIcon,
  ModalController,
  ToastController,
} from '@ionic/angular';
import { add, calendarOutline, closeCircleOutline, createOutline, flagOutline, trashOutline } from 'ionicons/icons';

import { ApiService } from '../core/api.service';
import { localToday, shortDate } from '../core/dates';
import { CATEGORY_LABELS, PRIORITY_LABELS, type GoalDetail, type GoalReading, type Milestone } from '../core/models';
import { AddMenuService } from '../shared/add-menu.service';
import { CategoryBadgeComponent, categoryClass } from '../shared/category-badge.component';
import { GoalFormComponent } from '../shared/goal-form.component';
import { GoalStatusChipComponent } from '../shared/goal-status-chip.component';
import { PageHeaderComponent } from '../shared/page-header.component';
import { ProgressRingComponent } from '../shared/progress-ring.component';
import { SectionHeaderComponent } from '../shared/section-header.component';
import { StateViewComponent } from '../shared/state-view.component';
import { TaskItemComponent } from '../shared/task-item.component';

@Component({
  selector: 'app-goal-detail',
  imports: [
    PageHeaderComponent,
    StateViewComponent,
    TaskItemComponent,
    CategoryBadgeComponent,
    GoalStatusChipComponent,
    ProgressRingComponent,
    SectionHeaderComponent,
    IonContent,
    IonButton,
    IonIcon,
    IonCheckbox,
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
    .hero-top .cat {
      flex: 1;
      color: var(--cat-ink);
    }
    h1 {
      margin: 14px 0 10px;
      font-size: 1.625rem;
      line-height: 1.2;
      overflow-wrap: anywhere;
    }
    .chips {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    .motivation {
      margin: 14px 0 0;
      padding-left: 12px;
      border-left: 3px solid var(--cat);
      font-family: var(--ob-font-display);
      font-size: 1.0625rem;
      font-style: italic;
      line-height: 1.4;
    }
    .description {
      margin: 12px 0 0;
      color: var(--ob-text-2);
    }
    .progress {
      display: flex;
      align-items: center;
      gap: 16px;
      margin-top: 18px;
      padding-top: 16px;
      border-top: 1px solid var(--ob-hairline);
      --ring-color: var(--cat);
    }
    .progress strong {
      display: block;
      font-size: 1.0625rem;
    }
    .progress small {
      color: var(--ob-text-2);
    }
    .pct {
      font-size: 1.25rem;
    }
    .pct small {
      font-size: 0.75rem;
    }
    section.block {
      margin-top: 28px;
    }
    .list {
      overflow: hidden;
    }
    .ms {
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 6px 4px 6px 8px;
    }
    .ms + .ms {
      border-top: 1px solid var(--ob-hairline);
    }
    .ms ion-checkbox {
      flex: none;
      padding: 9px;
    }
    .ms .txt {
      flex: 1;
      min-width: 0;
      padding: 6px 0;
    }
    .ms .txt p {
      margin: 0;
      font-weight: 550;
      line-height: 1.35;
      overflow-wrap: anywhere;
    }
    .ms .txt p.done {
      color: var(--ob-text-2);
      text-decoration: line-through;
    }
    .ms .txt small {
      color: var(--ob-text-2);
    }
    .reading strong {
      font-family: var(--ob-font-display);
      font-size: 1.125rem;
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
  `,
  template: `
    <app-page-header title="Objectif" backHref="/app/objectifs" [showProfile]="false">
      <ion-button class="icon-btn" fill="clear" (click)="edit()" aria-label="Modifier l’objectif">
        <ion-icon slot="icon-only" [icon]="icons.edit"></ion-icon>
      </ion-button>
      <ion-button class="icon-btn" fill="clear" (click)="remove()" aria-label="Supprimer l’objectif">
        <ion-icon slot="icon-only" [icon]="icons.trash"></ion-icon>
      </ion-button>
    </app-page-header>
    <ion-content>
      <div class="ob-container">
        <app-state-view [loading]="loading()" [error]="error()" [hero]="true" (retry)="load()">
          @if (goal(); as g) {
            <section [class]="cls(g)">
              <div class="hero-top">
                <app-category-badge [category]="g.category" [size]="48" />
                <p class="cat ob-eyebrow">{{ labels.category[g.category] }}</p>
                <app-goal-status-chip [status]="g.status" />
              </div>
              <h1 class="ob-display">{{ g.title }}</h1>
              <div class="chips">
                <span class="ob-chip"
                  ><ion-icon [icon]="icons.flag" aria-hidden="true"></ion-icon>Priorité
                  {{ labels.priority[g.priority].toLowerCase() }}</span
                >
                <span class="ob-chip"
                  ><ion-icon [icon]="icons.calendar" aria-hidden="true"></ion-icon>{{ date(g.startDate) }} →
                  {{ date(g.endDate) }}</span
                >
              </div>
              @if (g.motivation) {
                <p class="motivation">« {{ g.motivation }} »</p>
              }
              @if (g.description) {
                <p class="description">{{ g.description }}</p>
              }
              <div class="progress">
                @if (g.progress.percent !== null) {
                  <app-progress-ring
                    [value]="g.progress.percent / 100"
                    [size]="76"
                    [stroke]="9"
                    [label]="g.progress.label"
                  >
                    <span class="pct ob-display ob-num">{{ g.progress.percent }}<small>%</small></span>
                  </app-progress-ring>
                }
                <div>
                  <strong>{{ g.progress.label }}</strong>
                  @if (g.progress.mode === 'MESURE') {
                    <small>{{
                      g.progress.reached
                        ? 'Cible atteinte, bravo !'
                        : 'Départ ' + g.progress.start + ' · cible ' + g.progress.target
                    }}</small>
                  } @else if (g.progress.percent !== null) {
                    <small>Progression calculée par jalons</small>
                  }
                </div>
              </div>
            </section>

            @if (g.progressMode === 'MESURE') {
              <section class="block">
                <app-section-header title="Relevés" [count]="g.readings.length">
                  <ion-button class="ob-soft" size="small" (click)="addReading(g)">
                    <ion-icon slot="start" [icon]="icons.add" aria-hidden="true"></ion-icon>Relevé
                  </ion-button>
                </app-section-header>
                @if (g.readings.length > 0) {
                  <div class="list ob-card">
                    @for (r of g.readings; track r.id) {
                      <div class="ms">
                        <div class="txt reading">
                          <p>
                            <strong class="ob-num">{{ r.value }}</strong> {{ g.measureUnit }}
                          </p>
                          <small>{{ date(r.readOn) }}{{ r.note ? ' · ' + r.note : '' }}</small>
                        </div>
                        <ion-button
                          class="icon-btn"
                          fill="clear"
                          (click)="removeReading(r)"
                          [attr.aria-label]="'Supprimer le relevé du ' + date(r.readOn)"
                        >
                          <ion-icon slot="icon-only" [icon]="icons.remove"></ion-icon>
                        </ion-button>
                      </div>
                    }
                  </div>
                } @else {
                  <p class="hint">Enregistre ton premier relevé pour faire avancer ta progression.</p>
                }
              </section>
            }

            <section class="block">
              <app-section-header title="Jalons" [count]="g.milestones.length">
                <ion-button class="ob-soft" size="small" (click)="addMilestone()">
                  <ion-icon slot="start" [icon]="icons.add" aria-hidden="true"></ion-icon>Ajouter
                </ion-button>
              </app-section-header>
              @if (g.milestones.length > 0) {
                <div class="list ob-card">
                  @for (m of g.milestones; track m.id) {
                    <div class="ms">
                      <ion-checkbox
                        [checked]="m.completed"
                        (ionChange)="toggleMilestone(m)"
                        [attr.aria-label]="'Jalon terminé : ' + m.title"
                      ></ion-checkbox>
                      <div class="txt">
                        <p [class.done]="m.completed">{{ m.title }}</p>
                        <small>{{ m.dueDate ? 'Pour le ' + date(m.dueDate) : 'Sans date' }}</small>
                      </div>
                      <ion-button
                        fill="clear"
                        size="small"
                        (click)="planFor(m)"
                        [attr.aria-label]="'Planifier une action pour ' + m.title"
                        >Planifier</ion-button
                      >
                    </div>
                  }
                </div>
              } @else {
                <p class="hint">Ajoute un premier jalon, par exemple l'étape de ce mois-ci.</p>
              }
            </section>

            <section class="block">
              <app-section-header title="Actions" [count]="g.tasks.length">
                <ion-button class="ob-soft" size="small" (click)="planFor()">
                  <ion-icon slot="start" [icon]="icons.add" aria-hidden="true"></ion-icon>Ajouter
                </ion-button>
              </app-section-header>
              @if (g.needsNextAction) {
                <p class="hint">Aucune prochaine action. Planifie la prochaine étape pour avancer.</p>
              }
              @for (t of g.tasks; track t.id; let i = $index) {
                <app-task-item [task]="t" [index]="i" (changed)="load()" />
              }
            </section>
            <div class="ob-fab-space"></div>
          }
        </app-state-view>
      </div>
    </ion-content>
  `,
})
export class GoalDetailPage {
  private readonly api = inject(ApiService);
  private readonly alerts = inject(AlertController);
  private readonly modals = inject(ModalController);
  private readonly router = inject(Router);
  private readonly addMenu = inject(AddMenuService);
  private readonly toasts = inject(ToastController);

  /** Paramètre de route `:id`. */
  readonly id = input.required<string>();

  protected readonly goal = signal<GoalDetail | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly labels = { category: CATEGORY_LABELS, priority: PRIORITY_LABELS };
  protected readonly icons = {
    add,
    calendar: calendarOutline,
    edit: createOutline,
    flag: flagOutline,
    trash: trashOutline,
    remove: closeCircleOutline,
  };
  protected readonly cls = (g: GoalDetail): string => `hero ob-card ob-rise ${categoryClass(g.category)}`;
  protected readonly date = shortDate;

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

  protected async addReading(g: GoalDetail): Promise<void> {
    const alert = await this.alerts.create({
      header: 'Nouveau relevé',
      subHeader: g.measureUnit ?? undefined,
      inputs: [
        { name: 'value', type: 'number', placeholder: 'Valeur actuelle', value: g.progress.current },
        { name: 'readOn', type: 'date', value: localToday() },
        { name: 'note', placeholder: 'Note (facultatif)', attributes: { maxlength: 200 } },
      ],
      buttons: [
        { text: 'Fermer', role: 'cancel' },
        { text: 'Enregistrer', role: 'confirm' },
      ],
    });
    await alert.present();
    const { role, data } = await alert.onWillDismiss<{ values: { value: string; readOn: string; note: string } }>();
    if (role !== 'confirm' || !data) return;
    const value = data.values.value === '' ? NaN : Number(data.values.value);
    if (Number.isNaN(value)) {
      await this.say('Indique la valeur du relevé.', true);
      return;
    }
    try {
      await this.api.createReading(g.id, {
        value,
        readOn: data.values.readOn || undefined,
        note: data.values.note.trim() || null,
      });
      await this.load();
      await this.say('Relevé enregistré, bravo !');
    } catch (e) {
      await this.say(e instanceof Error ? e.message : 'Échec de l’enregistrement', true);
    }
  }

  protected async removeReading(r: GoalReading): Promise<void> {
    const alert = await this.alerts.create({
      header: 'Supprimer ce relevé ?',
      message: 'La progression sera recalculée avec le relevé précédent.',
      buttons: [
        { text: 'Garder', role: 'cancel' },
        { text: 'Supprimer', role: 'destructive' },
      ],
    });
    await alert.present();
    if ((await alert.onWillDismiss()).role !== 'destructive') return;
    try {
      await this.api.deleteReading(r.id);
      await this.load();
    } catch (e) {
      await this.say(e instanceof Error ? e.message : 'Suppression impossible', true);
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

  protected planFor(m?: Milestone): void {
    void this.addMenu.openTask({ presetGoalId: this.id(), presetMilestoneId: m?.id ?? null }, () => void this.load());
  }
}
