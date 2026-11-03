import { Component, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IonButton, IonContent, IonFab, IonFabButton, IonIcon } from '@ionic/angular';
import { add, arrowForward, flagOutline, flashOutline, flagSharp } from 'ionicons/icons';

import { ApiService } from '../core/api.service';
import { relativeDay, shortDate } from '../core/dates';
import { CATEGORY_LABELS, type Goal } from '../core/models';
import { AddMenuService } from '../shared/add-menu.service';
import { CategoryBadgeComponent, categoryClass } from '../shared/category-badge.component';
import { EmptyStateComponent } from '../shared/empty-state.component';
import { GoalStatusChipComponent } from '../shared/goal-status-chip.component';
import { PageHeaderComponent } from '../shared/page-header.component';
import { ProgressBarComponent } from '../shared/progress-bar.component';
import { StateViewComponent } from '../shared/state-view.component';

@Component({
  selector: 'app-goals',
  imports: [
    PageHeaderComponent,
    StateViewComponent,
    CategoryBadgeComponent,
    GoalStatusChipComponent,
    ProgressBarComponent,
    EmptyStateComponent,
    RouterLink,
    IonContent,
    IonButton,
    IonFab,
    IonFabButton,
    IonIcon,
  ],
  styles: `
    .welcome {
      margin: 8px 0 20px;
      padding: 22px 20px;
      border-radius: var(--ob-radius-xl);
      background: linear-gradient(145deg, #1d7a67, #0e4a3f);
      color: #fff;
    }
    .welcome h2 {
      margin: 0 0 4px;
      font-size: 1.5rem;
    }
    .welcome p {
      margin: 0 0 14px;
      opacity: 0.85;
    }
    .welcome ol {
      display: grid;
      gap: 10px;
      margin: 0 0 18px;
      padding: 0;
      list-style: none;
      counter-reset: step;
    }
    .welcome li {
      display: flex;
      align-items: center;
      gap: 12px;
      counter-increment: step;
      line-height: 1.35;
    }
    .welcome li::before {
      content: counter(step);
      display: grid;
      flex: none;
      place-items: center;
      width: 28px;
      height: 28px;
      border-radius: 50%;
      background: rgb(255 255 255 / 0.18);
      font-weight: 700;
      font-size: 0.875rem;
    }
    .welcome ion-button {
      --background: #fff;
      --color: #0e4a3f;
    }
    .goal {
      display: block;
      margin-bottom: 12px;
      padding: 16px;
      color: inherit;
      text-decoration: none;
      transition: transform 0.15s var(--ob-ease);
      -webkit-tap-highlight-color: transparent;
    }
    .goal:active {
      transform: scale(0.985);
    }
    .top {
      display: flex;
      align-items: flex-start;
      gap: 12px;
    }
    .top > div {
      flex: 1;
      min-width: 0;
    }
    .cat {
      margin-bottom: 2px;
      color: var(--cat-ink);
    }
    h3 {
      margin: 0;
      font-size: 1.1875rem;
      line-height: 1.25;
      overflow-wrap: anywhere;
    }
    .progress {
      margin-top: 16px;
    }
    .no-progress {
      margin: 0;
      font-size: 0.875rem;
    }
    .progress-line {
      display: flex;
      justify-content: space-between;
      gap: 8px;
      margin-bottom: 6px;
      font-size: 0.8125rem;
      font-weight: 600;
    }
    .foot {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin-top: 14px;
      padding-top: 12px;
      border-top: 1px solid var(--ob-hairline);
      font-size: 0.875rem;
    }
    .next {
      display: flex;
      align-items: flex-start;
      gap: 8px;
    }
    .next ion-icon {
      flex: none;
      margin-top: 3px;
      color: var(--cat-ink);
    }
    .deadline {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
  `,
  template: `
    <app-page-header title="Objectifs" eyebrow="Ce que je veux accomplir" />
    <ion-content>
      <div class="ob-container">
        @if (bienvenue() && goals().length === 0 && !loading()) {
          <section class="welcome ob-rise">
            <h2 class="ob-display">Bienvenue !</h2>
            <p>Trois étapes pour bien démarrer.</p>
            <ol>
              <li>Crée ton premier objectif.</li>
              <li>Choisis ta prochaine action et planifie-la.</li>
              <li>Ouvre « Aujourd'hui » et coche ce que tu accomplis.</li>
            </ol>
            <ion-button expand="block" (click)="create()">Créer mon premier objectif</ion-button>
          </section>
        }
        <app-state-view [loading]="loading()" [error]="error()" (retry)="load()">
          @for (g of goals(); track g.id; let i = $index) {
            <a [class]="cls(g)" [style.--i]="i" [routerLink]="['/app/objectifs', g.id]">
              <div class="top">
                <app-category-badge [category]="g.category" />
                <div>
                  <p class="cat ob-eyebrow">{{ category(g) }}</p>
                  <h3 class="ob-display">{{ g.title }}</h3>
                </div>
              </div>

              <div class="progress">
                @if (g.progress.percent !== null) {
                  <div class="progress-line">
                    <span>{{ g.progress.label }}</span>
                    <span class="ob-num">{{ g.progress.percent }} %</span>
                  </div>
                  <app-progress-bar [percent]="g.progress.percent" [label]="g.progress.label" />
                } @else {
                  <p class="ob-muted no-progress">{{ g.progress.label }}</p>
                }
              </div>

              <div class="foot">
                @if (g.nextAction; as next) {
                  <div class="next">
                    <ion-icon [icon]="icons.next" aria-hidden="true"></ion-icon>
                    <span><strong>Prochaine action :</strong> {{ next.title }} · {{ day(next.workDate) }}</span>
                  </div>
                } @else if (g.needsNextAction) {
                  <div class="deadline">
                    <span class="ob-chip ob-chip--warn"
                      ><ion-icon [icon]="icons.flash" aria-hidden="true"></ion-icon>Aucune prochaine action : ajoute-en
                      une</span
                    >
                  </div>
                }
                <div class="deadline">
                  <app-goal-status-chip [status]="g.status" />
                  <span class="ob-chip"
                    ><ion-icon [icon]="icons.flag" aria-hidden="true"></ion-icon>Échéance {{ date(g.endDate) }}</span
                  >
                </div>
              </div>
            </a>
          } @empty {
            @if (!bienvenue()) {
              <app-empty-state
                [icon]="icons.goal"
                title="Ton premier objectif t’attend"
                message="Un objectif, c’est un cap. On le découpe ensuite en petites étapes faciles à tenir."
              >
                <ion-button (click)="create()">Créer un objectif</ion-button>
              </app-empty-state>
            }
          }
          <div class="ob-fab-space"></div>
        </app-state-view>
      </div>
      <ion-fab slot="fixed" vertical="bottom" horizontal="end">
        <ion-fab-button (click)="create()" aria-label="Nouvel objectif"
          ><ion-icon [icon]="icons.add"></ion-icon
        ></ion-fab-button>
      </ion-fab>
    </ion-content>
  `,
})
export class GoalsPage {
  private readonly api = inject(ApiService);
  private readonly addMenu = inject(AddMenuService);

  /** Paramètre d'URL `?bienvenue=1` après l'inscription. */
  readonly bienvenue = input<string | undefined>();

  protected readonly goals = signal<Goal[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly icons = { add, next: arrowForward, flash: flashOutline, flag: flagSharp, goal: flagOutline };

  protected readonly category = (g: Goal): string => CATEGORY_LABELS[g.category];
  protected readonly cls = (g: Goal): string => `goal ob-card ob-rise ${categoryClass(g.category)}`;
  protected readonly date = shortDate;
  protected readonly day = relativeDay;

  ionViewWillEnter(): void {
    void this.load();
  }

  async load(): Promise<void> {
    this.error.set(null);
    try {
      this.goals.set(await this.api.goals());
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'Chargement impossible');
    } finally {
      this.loading.set(false);
    }
  }

  protected create(): void {
    void this.addMenu.openGoal(() => void this.load());
  }
}
