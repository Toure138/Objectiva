import { NgTemplateOutlet } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IonContent, IonIcon } from '@ionic/angular';
import { chevronForward, repeatOutline, timeOutline } from 'ionicons/icons';

import { ApiService } from '../core/api.service';
import { longDate } from '../core/dates';
import { EVENT_TYPE_LABELS, type SeriesSummary } from '../core/models';
import { repeatLabel } from '../core/repeat';
import { EmptyStateComponent } from '../shared/empty-state.component';
import { eventIcon } from '../shared/event-item.component';
import { PageHeaderComponent } from '../shared/page-header.component';
import { StateViewComponent } from '../shared/state-view.component';

/**
 * Réunions récurrentes (spec 010) : chaque série avec ses jours, ses heures et sa prochaine occurrence.
 * Toucher ouvre la prochaine occurrence, d'où l'on modifie la suite ou l'arrête.
 */
@Component({
  selector: 'app-series',
  imports: [
    NgTemplateOutlet,
    PageHeaderComponent,
    StateViewComponent,
    EmptyStateComponent,
    IonContent,
    IonIcon,
    RouterLink,
  ],
  template: `
    <app-page-header title="Réunions récurrentes" backHref="/app/planifier" [showProfile]="false" />
    <ion-content>
      <div class="ob-container">
        <app-state-view [loading]="loading()" [error]="error()" (retry)="load()">
          @for (s of series(); track s.id; let i = $index) {
            @if (s.nextOccurrence; as next) {
              <a
                class="ob-card ob-row ob-series ob-rise"
                [style.--i]="i"
                [routerLink]="['/app/evenements', next.id]"
                [attr.aria-label]="label(s)"
              >
                <ng-container *ngTemplateOutlet="body; context: { $implicit: s }" />
                <ion-icon [icon]="icons.chevron" aria-hidden="true"></ion-icon>
              </a>
            } @else {
              <div class="ob-card ob-row ob-series off" [attr.aria-label]="label(s)">
                <ng-container *ngTemplateOutlet="body; context: { $implicit: s }" />
              </div>
            }
          } @empty {
            <app-empty-state
              [icon]="icons.repeat"
              title="Aucune réunion récurrente"
              message="Quand tu crées un rendez-vous, choisis « Répéter » pour qu’il revienne chaque jour, en semaine ou chaque semaine."
            />
          }
        </app-state-view>
      </div>
    </ion-content>

    <ng-template #body let-s>
      <span class="ob-ico"><ion-icon [icon]="icon(s)" aria-hidden="true"></ion-icon></span>
      <span class="ob-row-txt">
        <strong>{{ s.title }}</strong>
        <span class="ob-muted">{{ repeat(s) }}</span>
        <span class="ob-muted"
          ><ion-icon [icon]="icons.time" aria-hidden="true"></ion-icon> {{ s.startTime }} – {{ s.endTime }}</span
        >
        @if (s.ended) {
          <span class="ob-chip">Terminée</span>
        } @else if (s.nextOccurrence; as next) {
          <span class="ob-chip ob-chip--primary">Prochaine : {{ day(next.date) }}</span>
        } @else {
          <span class="ob-chip">Aucune occurrence à venir</span>
        }
      </span>
    </ng-template>
  `,
})
export class SeriesPage {
  private readonly api = inject(ApiService);

  protected readonly series = signal<SeriesSummary[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly icons = { chevron: chevronForward, repeat: repeatOutline, time: timeOutline };

  ionViewWillEnter(): void {
    void this.load();
  }

  async load(): Promise<void> {
    this.error.set(null);
    try {
      this.series.set(await this.api.series());
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'Chargement impossible');
    } finally {
      this.loading.set(false);
    }
  }

  protected icon(s: SeriesSummary): string {
    return eventIcon(s.type);
  }

  protected repeat(s: SeriesSummary): string {
    return repeatLabel({ weekdays: s.weekdays, startDate: s.startDate, until: s.until });
  }

  protected day(date: string): string {
    return longDate(date);
  }

  protected label(s: SeriesSummary): string {
    const parts = [`${EVENT_TYPE_LABELS[s.type]} : ${s.title}`, this.repeat(s), `de ${s.startTime} à ${s.endTime}`];
    if (s.ended) parts.push('terminée');
    else if (s.nextOccurrence) parts.push(`prochaine le ${this.day(s.nextOccurrence.date)}`);
    return parts.join(', ');
  }
}
