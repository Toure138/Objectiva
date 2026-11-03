import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  IonButton,
  IonContent,
  IonFab,
  IonFabButton,
  IonIcon,
  IonRefresher,
  IonRefresherContent,
  type RefresherCustomEvent,
} from '@ionic/angular';
import { add, bulbOutline, chevronDown, leafOutline, sparklesOutline } from 'ionicons/icons';

import { ApiService } from '../core/api.service';
import { AuthService } from '../core/auth.service';
import { localToday, longDate } from '../core/dates';
import type { TodayView } from '../core/models';
import { AddMenuService } from '../shared/add-menu.service';
import { EmptyStateComponent } from '../shared/empty-state.component';
import { PageHeaderComponent } from '../shared/page-header.component';
import { ProgressRingComponent } from '../shared/progress-ring.component';
import { SectionHeaderComponent } from '../shared/section-header.component';
import { StateViewComponent } from '../shared/state-view.component';
import { TaskItemComponent } from '../shared/task-item.component';

@Component({
  selector: 'app-today',
  imports: [
    PageHeaderComponent,
    StateViewComponent,
    TaskItemComponent,
    ProgressRingComponent,
    SectionHeaderComponent,
    EmptyStateComponent,
    RouterLink,
    IonContent,
    IonButton,
    IonIcon,
    IonFab,
    IonFabButton,
    IonRefresher,
    IonRefresherContent,
  ],
  styles: `
    section {
      margin-top: 24px;
    }
    .hero {
      display: flex;
      align-items: center;
      gap: 18px;
      margin-top: 8px;
      padding: 18px;
      background: linear-gradient(
        135deg,
        color-mix(in srgb, var(--ion-color-primary) 15%, var(--ob-surface)),
        var(--ob-surface) 70%
      );
    }
    .hero.complete {
      --ring-color: var(--ob-ok);
    }
    .score {
      font-size: 1.75rem;
      line-height: 1;
    }
    .score small {
      font-size: 1rem;
      color: var(--ob-text-2);
    }
    .headline {
      margin: 2px 0 2px;
      font-size: 1.375rem;
      line-height: 1.2;
    }
    .hero p {
      margin: 0;
    }
    .suggestion {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 8px;
      padding: 12px 8px 12px 14px;
    }
    .suggestion .ico {
      display: grid;
      flex: none;
      place-items: center;
      width: 40px;
      height: 40px;
      border-radius: 13px;
      background: color-mix(in srgb, var(--ob-warn) 16%, var(--ob-surface));
      color: var(--ob-warn-ink);
      font-size: 22px;
    }
    .suggestion a {
      flex: 1;
      min-width: 0;
      color: var(--ob-text);
      font-weight: 550;
      line-height: 1.3;
      text-decoration: none;
      overflow-wrap: anywhere;
    }
    .toggle {
      display: flex;
      align-items: center;
      justify-content: space-between;
      width: 100%;
      min-height: 44px;
      padding: 0 4px;
      border: 0;
      background: transparent;
      color: var(--ob-text);
      font: inherit;
      font-size: 1.0625rem;
      font-weight: 650;
      cursor: pointer;
    }
    .toggle ion-icon {
      color: var(--ob-text-2);
      transition: transform 0.25s var(--ob-ease);
    }
    .toggle[aria-expanded='true'] ion-icon {
      transform: rotate(180deg);
    }
    .soon {
      margin: 28px 0 0;
      text-align: center;
      font-size: 0.8125rem;
    }
  `,
  template: `
    <app-page-header [eyebrow]="eyebrow()" [title]="greeting()" />
    <ion-content>
      <ion-refresher slot="fixed" (ionRefresh)="refresh($event)"><ion-refresher-content /></ion-refresher>
      <div class="ob-container">
        <app-state-view [loading]="loading()" [error]="error()" [hero]="true" (retry)="load()">
          @if (view(); as v) {
            <div class="hero ob-card ob-rise" [class.complete]="allDone()">
              <app-progress-ring [value]="ratio()" [size]="96" [stroke]="10" [label]="summary()">
                <span class="score ob-display ob-num"
                  >{{ v.done.length }}<small>/{{ total() }}</small></span
                >
              </app-progress-ring>
              <div>
                <p class="ob-eyebrow">Ta journée</p>
                <p class="headline ob-display">{{ headline() }}</p>
                <p class="ob-muted">{{ summary() }}</p>
              </div>
            </div>

            <section>
              <app-section-header title="À faire aujourd'hui" [count]="v.planned.length" />
              @for (t of v.planned; track t.id; let i = $index) {
                <app-task-item [task]="t" [showDate]="false" [index]="i" (changed)="load()" />
              } @empty {
                @if (v.done.length > 0) {
                  <app-empty-state
                    [icon]="icons.leaf"
                    title="Tout est fait pour aujourd’hui"
                    message="Bravo, profite de ce moment. Demain est une nouvelle page."
                  />
                } @else {
                  <app-empty-state
                    [icon]="icons.leaf"
                    title="Journée libre"
                    message="{{
                      v.emptyMessage ?? 'Aucune action prévue'
                    }}. Ajoute une petite action pour te mettre en route."
                  >
                    <ion-button class="ob-soft" (click)="add()">Ajouter une action</ion-button>
                  </app-empty-state>
                }
              }
            </section>

            @if (v.toReschedule.length + v.overdue.length > 0) {
              <section>
                <app-section-header
                  title="À replanifier"
                  tone="warn"
                  [count]="v.toReschedule.length + v.overdue.length"
                  hint="Rien de grave : choisis un nouveau jour pour ces actions."
                />
                @for (t of v.toReschedule; track t.id; let i = $index) {
                  <app-task-item [task]="t" [index]="i" (changed)="load()" />
                }
                @for (t of v.overdue; track t.id; let i = $index) {
                  <app-task-item [task]="t" [index]="i" (changed)="load()" />
                }
              </section>
            }

            @if (v.goalsWithoutNextAction.length > 0) {
              <section>
                <app-section-header title="Et ensuite ?" hint="Ces objectifs n’ont pas encore de prochaine action." />
                @for (g of v.goalsWithoutNextAction; track g.id) {
                  <div class="suggestion ob-card">
                    <span class="ico"><ion-icon [icon]="icons.bulb" aria-hidden="true"></ion-icon></span>
                    <a [routerLink]="['/app/objectifs', g.id]">{{ g.title }}</a>
                    <ion-button class="ob-soft" size="small" (click)="addFor(g.id)">Planifier</ion-button>
                  </div>
                }
              </section>
            }

            @if (v.done.length > 0) {
              <section>
                <button
                  type="button"
                  class="toggle"
                  [attr.aria-expanded]="showDone()"
                  (click)="showDone.set(!showDone())"
                >
                  <span>Terminées · {{ v.done.length }}</span>
                  <ion-icon [icon]="icons.chevron" aria-hidden="true"></ion-icon>
                </button>
                @if (showDone()) {
                  @for (t of v.done; track t.id; let i = $index) {
                    <app-task-item [task]="t" [showDate]="false" [index]="i" (changed)="load()" />
                  }
                }
              </section>
            }

            <p class="soon ob-muted">
              <ion-icon [icon]="icons.sparkles" aria-hidden="true"></ion-icon>
              Budget du jour, habitudes et rendez-vous : bientôt disponibles.
            </p>
            <div class="ob-fab-space"></div>
          }
        </app-state-view>
      </div>

      <ion-fab slot="fixed" vertical="bottom" horizontal="end">
        <ion-fab-button (click)="add()" aria-label="Ajouter"><ion-icon [icon]="icons.add"></ion-icon></ion-fab-button>
      </ion-fab>
    </ion-content>
  `,
})
export class TodayPage {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly addMenu = inject(AddMenuService);

  protected readonly view = signal<TodayView | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly showDone = signal(false);
  protected readonly icons = {
    add,
    bulb: bulbOutline,
    chevron: chevronDown,
    leaf: leafOutline,
    sparkles: sparklesOutline,
  };

  protected readonly eyebrow = computed(() => longDate(this.view()?.date ?? localToday()));
  protected readonly greeting = computed(() => {
    const hour = new Date().getHours();
    const hello = hour < 5 || hour >= 18 ? 'Bonsoir' : hour < 12 ? 'Bonjour' : 'Bon après-midi';
    const name = this.auth.user()?.displayName.trim();
    return name ? `${hello}, ${name}` : hello;
  });
  protected readonly total = computed(() => (this.view() ? this.view()!.planned.length + this.view()!.done.length : 0));
  // Simple part d'actions terminées parmi celles du jour (affichage de l'anneau uniquement).
  protected readonly ratio = computed(() => (this.total() ? this.view()!.done.length / this.total() : 0));
  protected readonly allDone = computed(() => this.total() > 0 && this.view()!.planned.length === 0);
  protected readonly headline = computed(() => {
    if (this.total() === 0) return 'Journée libre';
    if (this.allDone()) return 'Journée accomplie !';
    return this.view()!.done.length === 0 ? 'C’est parti !' : 'Tu avances bien';
  });
  protected readonly summary = computed(() => {
    const v = this.view();
    if (!v) return '';
    const total = this.total();
    if (total === 0) return 'Aucune action prévue';
    return `${v.done.length} sur ${total} action${total > 1 ? 's' : ''} terminée${v.done.length > 1 ? 's' : ''}`;
  });

  // Recharge à chaque retour sur l'onglet : les autres écrans ont pu modifier les tâches.
  ionViewWillEnter(): void {
    void this.load();
  }

  async load(): Promise<void> {
    this.error.set(null);
    if (!this.view()) this.loading.set(true);
    try {
      this.view.set(await this.api.today());
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'Chargement impossible');
    } finally {
      this.loading.set(false);
    }
  }

  async refresh(event: RefresherCustomEvent): Promise<void> {
    await this.load();
    await event.target.complete();
  }

  add(): void {
    void this.addMenu.open(() => void this.load());
  }

  addFor(goalId: string): void {
    void this.addMenu.openTask({ presetGoalId: goalId }, () => void this.load());
  }
}
