import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  IonAccordion,
  IonAccordionGroup,
  IonButton,
  IonContent,
  IonFab,
  IonFabButton,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonListHeader,
  IonNote,
  IonRefresher,
  IonRefresherContent,
  type RefresherCustomEvent,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { add, bulbOutline } from 'ionicons/icons';

import { ApiService } from '../core/api.service';
import { longDate } from '../core/dates';
import type { TodayView } from '../core/models';
import { AddMenuService } from '../shared/add-menu.service';
import { PageHeaderComponent } from '../shared/page-header.component';
import { StateViewComponent } from '../shared/state-view.component';
import { TaskItemComponent } from '../shared/task-item.component';

@Component({
  selector: 'app-today',
  imports: [
    PageHeaderComponent,
    StateViewComponent,
    TaskItemComponent,
    RouterLink,
    IonContent,
    IonList,
    IonListHeader,
    IonLabel,
    IonItem,
    IonNote,
    IonButton,
    IonIcon,
    IonFab,
    IonFabButton,
    IonRefresher,
    IonRefresherContent,
    IonAccordionGroup,
    IonAccordion,
  ],
  styles: `
    .date {
      padding: 16px 16px 0;
      margin: 0;
      font-size: 1.3rem;
      font-weight: 600;
    }
    .summary {
      padding: 0 16px;
      color: var(--ion-color-medium);
    }
    .empty {
      padding: 24px 16px;
      text-align: center;
      color: var(--ion-color-medium);
    }
    ion-list-header {
      font-weight: 600;
    }
    .spacer {
      height: 88px;
    }
  `,
  template: `
    <app-page-header title="Aujourd'hui" />
    <ion-content>
      <ion-refresher slot="fixed" (ionRefresh)="refresh($event)"><ion-refresher-content /></ion-refresher>
      <app-state-view [loading]="loading()" [error]="error()" (retry)="load()">
        @if (view(); as v) {
          <h2 class="date">{{ title() }}</h2>
          <p class="summary">{{ summary() }}</p>

          <ion-list>
            <ion-list-header><ion-label>Mes actions du jour</ion-label></ion-list-header>
            @for (t of v.planned; track t.id) {
              <app-task-item [task]="t" [showDate]="false" (changed)="load()" />
            } @empty {
              <p class="empty">{{ v.emptyMessage ?? 'Tout est fait pour aujourd’hui. Bravo !' }}</p>
            }
          </ion-list>

          @if (v.toReschedule.length + v.overdue.length > 0) {
            <ion-list>
              <ion-list-header><ion-label>À replanifier</ion-label></ion-list-header>
              @for (t of v.toReschedule; track t.id) {
                <app-task-item [task]="t" (changed)="load()" />
              }
              @for (t of v.overdue; track t.id) {
                <app-task-item [task]="t" (changed)="load()" />
              }
            </ion-list>
          }

          @if (v.goalsWithoutNextAction.length > 0) {
            <ion-list>
              <ion-list-header><ion-label>Objectifs sans prochaine action</ion-label></ion-list-header>
              @for (g of v.goalsWithoutNextAction; track g.id) {
                <ion-item lines="full">
                  <ion-icon name="bulb-outline" slot="start" aria-hidden="true"></ion-icon>
                  <ion-label class="ion-text-wrap" [routerLink]="['/app/objectifs', g.id]">{{ g.title }}</ion-label>
                  <ion-button slot="end" fill="outline" size="small" (click)="addFor(g.id)">Planifier</ion-button>
                </ion-item>
              }
            </ion-list>
          }

          @if (v.done.length > 0) {
            <ion-accordion-group>
              <ion-accordion value="faites">
                <ion-item slot="header"
                  ><ion-label>Terminées ({{ v.done.length }})</ion-label></ion-item
                >
                <ion-list slot="content">
                  @for (t of v.done; track t.id) {
                    <app-task-item [task]="t" [showDate]="false" (changed)="load()" />
                  }
                </ion-list>
              </ion-accordion>
            </ion-accordion-group>
          }

          <ion-item lines="none">
            <ion-note>Budget du jour, habitudes et rendez-vous : bientôt disponibles.</ion-note>
          </ion-item>
          <div class="spacer"></div>
        }
      </app-state-view>

      <ion-fab slot="fixed" vertical="bottom" horizontal="end">
        <ion-fab-button (click)="add()" aria-label="Ajouter"><ion-icon name="add"></ion-icon></ion-fab-button>
      </ion-fab>
    </ion-content>
  `,
})
export class TodayPage {
  private readonly api = inject(ApiService);
  private readonly addMenu = inject(AddMenuService);

  protected readonly view = signal<TodayView | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);

  protected readonly title = computed(() => (this.view() ? longDate(this.view()!.date) : ''));
  protected readonly summary = computed(() => {
    const v = this.view();
    if (!v) return '';
    const total = v.planned.length + v.done.length;
    if (total === 0) return 'Aucune action prévue';
    return `${v.done.length} sur ${total} action${total > 1 ? 's' : ''} terminée${v.done.length > 1 ? 's' : ''}`;
  });

  constructor() {
    addIcons({ add, bulbOutline });
  }

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
