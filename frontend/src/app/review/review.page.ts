import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  IonButton,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardTitle,
  IonContent,
  IonItem,
  IonLabel,
  IonList,
  IonNote,
  IonProgressBar,
  IonSegment,
  IonSegmentButton,
  IonTextarea,
  IonToolbar,
} from '@ionic/angular';

import { ApiService } from '../core/api.service';
import { addDays, localToday, shortDate } from '../core/dates';
import type { Review } from '../core/models';
import { AddMenuService } from '../shared/add-menu.service';
import { PageHeaderComponent } from '../shared/page-header.component';
import { StateViewComponent } from '../shared/state-view.component';

type Period = 'day' | 'week' | 'month';

@Component({
  selector: 'app-review',
  imports: [
    FormsModule,
    PageHeaderComponent,
    StateViewComponent,
    IonContent,
    IonToolbar,
    IonSegment,
    IonSegmentButton,
    IonLabel,
    IonCard,
    IonCardHeader,
    IonCardTitle,
    IonCardContent,
    IonList,
    IonItem,
    IonNote,
    IonProgressBar,
    IonTextarea,
    IonButton,
  ],
  styles: `
    .rate {
      font-size: 2rem;
      font-weight: 700;
    }
    .grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 4px 12px;
      margin-top: 8px;
    }
    ion-progress-bar {
      margin: 6px 0;
    }
  `,
  template: `
    <app-page-header title="Bilan" />
    <ion-toolbar>
      <ion-segment [value]="period()" (ionChange)="setPeriod($any($event.detail.value))">
        <ion-segment-button value="day"><ion-label>Jour</ion-label></ion-segment-button>
        <ion-segment-button value="week"><ion-label>Semaine</ion-label></ion-segment-button>
        <ion-segment-button value="month"><ion-label>Mois</ion-label></ion-segment-button>
      </ion-segment>
    </ion-toolbar>
    <ion-content>
      <app-state-view [loading]="loading()" [error]="error()" (retry)="load()">
        @if (review(); as r) {
          <ion-card>
            <ion-card-header>
              <ion-card-title>Exécution du planning</ion-card-title>
              <ion-note>{{ range(r) }}</ion-note>
            </ion-card-header>
            <ion-card-content>
              @if (r.tasks.executionRate; as rate) {
                <div class="rate">{{ rate.percent }} %</div>
                <ion-note
                  >{{ rate.numerator }} action{{ rate.numerator > 1 ? 's' : '' }} réalisée{{
                    rate.numerator > 1 ? 's' : ''
                  }}
                  sur {{ rate.denominator }} attendue{{ rate.denominator > 1 ? 's' : '' }}</ion-note
                >
              } @else {
                <p>Aucune action attendue sur cette période : pas de taux à calculer.</p>
              }
              <div class="grid">
                <span>Prévues au départ</span><strong>{{ r.tasks.plannedAtStart }}</strong> <span>Ajoutées ensuite</span
                ><strong>{{ r.tasks.addedDuringPeriod }}</strong> <span>Réalisées</span
                ><strong>{{ r.tasks.done }}</strong> <span>Encore à faire</span><strong>{{ r.tasks.pending }}</strong>
                <span>Reportées</span><strong>{{ r.tasks.rescheduledOut }}</strong> <span>Annulées (hors calcul)</span
                ><strong>{{ r.tasks.cancelled }}</strong>
              </div>
            </ion-card-content>
          </ion-card>

          <ion-card>
            <ion-card-header><ion-card-title>Progression des objectifs</ion-card-title></ion-card-header>
            <ion-card-content>
              @for (g of r.goals; track g.id) {
                <div>
                  <strong>{{ g.title }}</strong>
                  @if (g.progress.percent !== null) {
                    <ion-progress-bar
                      [value]="g.progress.percent / 100"
                      [attr.aria-label]="g.progress.label"
                    ></ion-progress-bar>
                  }
                  <ion-note
                    >{{ g.progress.label
                    }}{{
                      g.milestonesDoneInPeriod ? ' · ' + g.milestonesDoneInPeriod + ' sur cette période' : ''
                    }}</ion-note
                  >
                </div>
              } @empty {
                <p>Aucun objectif actif.</p>
              }
            </ion-card-content>
          </ion-card>

          <ion-card>
            <ion-card-header><ion-card-title>Mes réflexions</ion-card-title></ion-card-header>
            <ion-card-content>
              <ion-list>
                @for (q of r.questions; track q; let i = $index) {
                  <ion-item>
                    <ion-textarea
                      [label]="q"
                      labelPlacement="stacked"
                      [autoGrow]="true"
                      [(ngModel)]="answers[i]"
                      [name]="'q' + i"
                      placeholder="Facultatif"
                    ></ion-textarea>
                  </ion-item>
                }
              </ion-list>
              <ion-note>L'enregistrement de tes réponses arrive à une prochaine étape.</ion-note>
              <ion-button expand="block" class="ion-margin-top" (click)="planNext()"
                >Planifier ma prochaine priorité</ion-button
              >
            </ion-card-content>
          </ion-card>
        }
      </app-state-view>
    </ion-content>
  `,
})
export class ReviewPage {
  private readonly api = inject(ApiService);
  private readonly addMenu = inject(AddMenuService);

  protected readonly period = signal<Period>('day');
  protected readonly review = signal<Review | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected answers: string[] = ['', '', ''];

  ionViewWillEnter(): void {
    void this.load();
  }

  protected setPeriod(p: Period): void {
    this.period.set(p);
    void this.load();
  }

  async load(): Promise<void> {
    this.error.set(null);
    try {
      this.review.set(await this.api.review({ period: this.period(), date: localToday() }));
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'Chargement impossible');
    } finally {
      this.loading.set(false);
    }
  }

  protected range(r: Review): string {
    return r.from === r.to ? shortDate(r.from) : `du ${shortDate(r.from)} au ${shortDate(r.to)}`;
  }

  protected planNext(): void {
    void this.addMenu.openTask(
      { presetTitle: this.answers[2]?.trim() ?? '', presetDate: addDays(localToday(), 1) },
      () => void this.load(),
    );
  }
}
