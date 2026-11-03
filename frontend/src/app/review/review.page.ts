import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonButton, IonContent, IonItem, IonList, IonTextarea } from '@ionic/angular';
import { hourglassOutline } from 'ionicons/icons';

import { ApiService } from '../core/api.service';
import { addDays, localToday, shortDate } from '../core/dates';
import type { Review } from '../core/models';
import { AddMenuService } from '../shared/add-menu.service';
import { EmptyStateComponent } from '../shared/empty-state.component';
import { PageHeaderComponent } from '../shared/page-header.component';
import { ProgressBarComponent } from '../shared/progress-bar.component';
import { ProgressRingComponent } from '../shared/progress-ring.component';
import { SectionHeaderComponent } from '../shared/section-header.component';
import { SegmentedComponent, type SegmentOption } from '../shared/segmented.component';
import { StateViewComponent } from '../shared/state-view.component';

type Period = 'day' | 'week' | 'month';

interface Stat {
  label: string;
  value: number;
  tone?: 'ok' | 'warn';
}

@Component({
  selector: 'app-review',
  imports: [
    FormsModule,
    PageHeaderComponent,
    StateViewComponent,
    SegmentedComponent,
    SectionHeaderComponent,
    ProgressRingComponent,
    ProgressBarComponent,
    EmptyStateComponent,
    IonContent,
    IonList,
    IonItem,
    IonTextarea,
    IonButton,
  ],
  styles: `
    .switch {
      padding-block: 4px 12px;
    }
    section {
      margin-top: 24px;
    }
    .hero {
      display: flex;
      align-items: center;
      gap: 20px;
      padding: 20px;
      background: linear-gradient(
        135deg,
        color-mix(in srgb, var(--ion-color-primary) 15%, var(--ob-surface)),
        var(--ob-surface) 70%
      );
    }
    .rate {
      font-size: 1.875rem;
      line-height: 1;
    }
    .rate small {
      font-size: 1rem;
    }
    .headline {
      margin: 0 0 4px;
      font-size: 1.375rem;
      line-height: 1.2;
    }
    .hero p {
      margin: 0;
    }
    .stats {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 10px;
      margin-top: 10px;
    }
    .stat {
      padding: 14px 16px;
    }
    .stat .n {
      display: block;
      font-size: 1.75rem;
      line-height: 1.1;
    }
    .stat.ok .n {
      color: var(--ob-ok);
    }
    .stat.warn .n {
      color: var(--ob-warn-ink);
    }
    .stat .l {
      display: block;
      margin-top: 2px;
      color: var(--ob-text-2);
      font-size: 0.8125rem;
      font-weight: 500;
      line-height: 1.3;
    }
    .goal {
      margin-bottom: 10px;
      padding: 14px 16px;
    }
    .goal strong {
      display: block;
      margin-bottom: 10px;
      line-height: 1.3;
      overflow-wrap: anywhere;
    }
    .goal small {
      display: block;
      margin-top: 8px;
      color: var(--ob-text-2);
    }
    .reflect {
      padding: 16px;
    }
    .reflect p.note {
      margin: 0 0 12px;
      font-size: 0.875rem;
    }
    .reflect ion-list {
      padding: 0;
      background: transparent;
    }
  `,
  template: `
    <app-page-header title="Bilan" [eyebrow]="eyebrow()" />
    <ion-content>
      <div class="ob-container">
        <div class="switch">
          <app-segmented
            [options]="options"
            [value]="period()"
            (valueChange)="setPeriod($event)"
            ariaLabel="Période du bilan"
          />
        </div>
        <app-state-view [loading]="loading()" [error]="error()" [hero]="true" (retry)="load()">
          @if (review(); as r) {
            @if (r.tasks.executionRate; as rate) {
              <div class="hero ob-card ob-rise">
                <app-progress-ring
                  [value]="rate.percent / 100"
                  [size]="112"
                  [stroke]="11"
                  [label]="'Taux d’exécution : ' + rate.percent + ' %'"
                >
                  <span class="rate ob-display ob-num">{{ rate.percent }}<small>%</small></span>
                </app-progress-ring>
                <div>
                  <p class="ob-eyebrow">Exécution du planning</p>
                  <p class="headline ob-display">{{ message(rate.percent) }}</p>
                  <p class="ob-muted">
                    {{ rate.numerator }} action{{ rate.numerator > 1 ? 's' : '' }} réalisée{{
                      rate.numerator > 1 ? 's' : ''
                    }}
                    sur {{ rate.denominator }} attendue{{ rate.denominator > 1 ? 's' : '' }}
                  </p>
                </div>
              </div>
            } @else {
              <div class="ob-card ob-rise">
                <app-empty-state
                  [icon]="icons.hourglass"
                  title="Pas encore de taux"
                  message="Aucune action attendue sur cette période : il n’y a rien à calculer, et c’est très bien ainsi."
                />
              </div>
            }

            <div class="stats">
              @for (s of stats(r); track s.label; let i = $index) {
                <div
                  class="stat ob-card ob-rise"
                  [class.ok]="s.tone === 'ok'"
                  [class.warn]="s.tone === 'warn'"
                  [style.--i]="i"
                >
                  <span class="n ob-display ob-num">{{ s.value }}</span>
                  <span class="l">{{ s.label }}</span>
                </div>
              }
            </div>

            <section>
              <app-section-header title="Progression des objectifs" />
              @for (g of r.goals; track g.id) {
                <div class="goal ob-card">
                  <strong>{{ g.title }}</strong>
                  @if (g.progress.percent !== null) {
                    <app-progress-bar [percent]="g.progress.percent" [label]="g.progress.label" />
                  }
                  <small
                    >{{ g.progress.label
                    }}{{
                      g.milestonesDoneInPeriod ? ' · ' + g.milestonesDoneInPeriod + ' sur cette période' : ''
                    }}</small
                  >
                </div>
              } @empty {
                <p class="ob-muted">Aucun objectif actif.</p>
              }
            </section>

            <section>
              <app-section-header title="Mes réflexions" />
              <div class="reflect ob-card">
                <p class="note ob-muted">
                  Prends une minute pour toi. L’enregistrement de tes réponses arrive à une prochaine étape.
                </p>
                <ion-list class="ob-form" lines="none">
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
                <ion-button expand="block" (click)="planNext()">Planifier ma prochaine priorité</ion-button>
              </div>
            </section>
            <div class="ob-fab-space"></div>
          }
        </app-state-view>
      </div>
    </ion-content>
  `,
})
export class ReviewPage {
  private readonly api = inject(ApiService);
  private readonly addMenu = inject(AddMenuService);

  protected readonly options: SegmentOption[] = [
    { value: 'day', label: 'Jour' },
    { value: 'week', label: 'Semaine' },
    { value: 'month', label: 'Mois' },
  ];
  protected readonly icons = { hourglass: hourglassOutline };
  protected readonly period = signal<Period>('day');
  protected readonly review = signal<Review | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly eyebrow = computed(() => {
    const r = this.review();
    return r ? this.range(r) : 'Ce que j’ai accompli';
  });
  protected answers: string[] = ['', '', ''];

  ionViewWillEnter(): void {
    void this.load();
  }

  protected setPeriod(p: string): void {
    this.period.set(p as Period);
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
    return r.from === r.to ? shortDate(r.from) : `${shortDate(r.from)} → ${shortDate(r.to)}`;
  }

  // Message d'encouragement selon le taux fourni par l'API (présentation seulement).
  protected message(percent: number): string {
    if (percent >= 80) return 'Superbe régularité !';
    if (percent >= 50) return 'Belle progression';
    return 'Chaque pas compte';
  }

  protected stats(r: Review): Stat[] {
    const t = r.tasks;
    return [
      { label: 'Réalisées', value: t.done, tone: 'ok' },
      { label: 'Encore à faire', value: t.pending },
      { label: 'Prévues au départ', value: t.plannedAtStart },
      { label: 'Ajoutées ensuite', value: t.addedDuringPeriod },
      { label: 'Reportées', value: t.rescheduledOut, tone: 'warn' },
      { label: 'Annulées (hors calcul)', value: t.cancelled },
      ...(r.events.expected + r.events.cancelled > 0
        ? [
            { label: 'Rendez-vous réalisés', value: r.events.done, tone: 'ok' as const },
            { label: 'Rendez-vous à venir', value: r.events.planned },
          ]
        : []),
    ];
  }

  protected planNext(): void {
    void this.addMenu.openTask(
      { presetTitle: this.answers[2]?.trim() ?? '', presetDate: addDays(localToday(), 1) },
      () => void this.load(),
    );
  }
}
