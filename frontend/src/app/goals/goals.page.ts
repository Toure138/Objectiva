import { Component, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  IonButton,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardSubtitle,
  IonCardTitle,
  IonContent,
  IonFab,
  IonFabButton,
  IonIcon,
  IonNote,
  IonProgressBar,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { add, arrowForwardOutline } from 'ionicons/icons';

import { ApiService } from '../core/api.service';
import { relativeDay, shortDate } from '../core/dates';
import { CATEGORY_LABELS, GOAL_STATUS_LABELS, type Goal } from '../core/models';
import { AddMenuService } from '../shared/add-menu.service';
import { PageHeaderComponent } from '../shared/page-header.component';
import { StateViewComponent } from '../shared/state-view.component';

@Component({
  selector: 'app-goals',
  imports: [
    PageHeaderComponent,
    StateViewComponent,
    RouterLink,
    IonContent,
    IonCard,
    IonCardHeader,
    IonCardTitle,
    IonCardSubtitle,
    IonCardContent,
    IonProgressBar,
    IonNote,
    IonButton,
    IonFab,
    IonFabButton,
    IonIcon,
  ],
  styles: `
    .welcome {
      margin: 16px;
    }
    .next {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-top: 8px;
    }
    .empty {
      padding: 24px 16px;
      text-align: center;
      color: var(--ion-color-medium);
    }
    .spacer {
      height: 88px;
    }
    ion-progress-bar {
      margin: 8px 0 4px;
    }
  `,
  template: `
    <app-page-header title="Objectifs" />
    <ion-content>
      @if (bienvenue() && goals().length === 0) {
        <ion-card class="welcome" color="light">
          <ion-card-header>
            <ion-card-title>Bienvenue !</ion-card-title>
            <ion-card-subtitle>3 étapes pour bien démarrer</ion-card-subtitle>
          </ion-card-header>
          <ion-card-content>
            <ol>
              <li>Crée ton premier objectif.</li>
              <li>Choisis ta prochaine action et planifie-la.</li>
              <li>Ouvre « Aujourd'hui » et coche ce que tu accomplis.</li>
            </ol>
            <ion-button expand="block" (click)="create()">Créer mon premier objectif</ion-button>
          </ion-card-content>
        </ion-card>
      }
      <app-state-view [loading]="loading()" [error]="error()" (retry)="load()">
        @for (g of goals(); track g.id) {
          <ion-card [routerLink]="['/app/objectifs', g.id]" button>
            <ion-card-header>
              <ion-card-subtitle
                >{{ category(g) }} · {{ status(g) }} · échéance {{ date(g.endDate) }}</ion-card-subtitle
              >
              <ion-card-title>{{ g.title }}</ion-card-title>
            </ion-card-header>
            <ion-card-content>
              @if (g.progress.percent !== null) {
                <ion-progress-bar
                  [value]="g.progress.percent / 100"
                  [attr.aria-label]="g.progress.label"
                ></ion-progress-bar>
              }
              <ion-note>{{ g.progress.label }}</ion-note>
              @if (g.nextAction; as next) {
                <div class="next">
                  <ion-icon name="arrow-forward-outline" aria-hidden="true"></ion-icon>
                  <span>{{ next.title }} — {{ day(next.workDate) }}</span>
                </div>
              } @else if (g.needsNextAction) {
                <div class="next"><ion-note color="warning">Aucune prochaine action : ajoute-en une.</ion-note></div>
              }
            </ion-card-content>
          </ion-card>
        } @empty {
          @if (!bienvenue()) {
            <div class="empty">
              <p>Aucun objectif pour l'instant.</p>
              <ion-button (click)="create()">Créer un objectif</ion-button>
            </div>
          }
        }
        <div class="spacer"></div>
      </app-state-view>
      <ion-fab slot="fixed" vertical="bottom" horizontal="end">
        <ion-fab-button (click)="create()" aria-label="Nouvel objectif"
          ><ion-icon name="add"></ion-icon
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

  protected readonly category = (g: Goal): string => CATEGORY_LABELS[g.category];
  protected readonly status = (g: Goal): string => GOAL_STATUS_LABELS[g.status];
  protected readonly date = shortDate;
  protected readonly day = relativeDay;

  constructor() {
    addIcons({ add, arrowForwardOutline });
  }

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
