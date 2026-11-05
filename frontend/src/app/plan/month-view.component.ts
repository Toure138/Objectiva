import { Component, computed, input, output } from '@angular/core';
import { IonIcon } from '@ionic/angular';
import { alertCircle } from 'ionicons/icons';

import { isoWeekday } from '../../../../shared/src/recurrence.rules';
import { longDate } from '../core/dates';
import type { CalendarDay, CalendarMonth } from '../core/models';
import { WEEKDAYS } from '../core/repeat';

const plural = (n: number, one: string, many: string): string => `${n} ${n > 1 ? many : one}`;

/**
 * Calendrier d'un mois (lundi en premier). Chaque jour montre ses rendez-vous et tâches à faire, et une alerte
 * s'il y a un chevauchement ; le lecteur d'écran l'entend en toutes lettres. Affichage seul : les nombres
 * viennent de l'API ou du moteur local.
 */
@Component({
  selector: 'app-month-view',
  imports: [IonIcon],
  template: `
    <div class="ob-month">
      <div class="ob-month-head" aria-hidden="true">
        @for (d of weekdays; track d.day) {
          <span>{{ d.short }}</span>
        }
      </div>
      <div class="ob-month-days" role="group" aria-label="Jours du mois">
        @for (blank of blanks(); track $index) {
          <span class="blank" aria-hidden="true"></span>
        }
        @for (d of month().days; track d.date) {
          <button
            type="button"
            [class.today]="d.date === today()"
            [class.on]="d.date === selected()"
            [class.busy]="d.events + d.tasks > 0"
            [attr.aria-pressed]="d.date === selected()"
            [attr.aria-label]="label(d)"
            (click)="pick.emit(d.date)"
          >
            <span class="n">{{ +d.date.slice(8) }}</span>
            <span class="marks" aria-hidden="true">
              @if (d.events > 0) {
                <span class="e">{{ d.events }}</span>
              }
              @if (d.tasks > 0) {
                <span class="t">{{ d.tasks }}</span>
              }
            </span>
            @if (d.conflict) {
              <ion-icon class="warn" [icon]="alert" aria-hidden="true"></ion-icon>
            }
          </button>
        }
      </div>
    </div>
    <p class="ob-month-legend">
      <span><span class="e" aria-hidden="true">2</span> rendez-vous</span>
      <span><span class="t" aria-hidden="true">3</span> tâches à faire</span>
      <span><ion-icon class="warn" [icon]="alert" aria-hidden="true"></ion-icon> chevauchement</span>
    </p>
  `,
})
export class MonthViewComponent {
  readonly month = input.required<CalendarMonth>();
  readonly selected = input<string | null>(null);
  readonly today = input<string>('');
  readonly pick = output<string>();

  protected readonly weekdays = WEEKDAYS;
  protected readonly alert = alertCircle;
  /** Cases vides avant le 1er (le calendrier commence le lundi). */
  protected readonly blanks = computed(() => Array.from({ length: isoWeekday(`${this.month().month}-01`) - 1 }));

  protected label(d: CalendarDay): string {
    const parts: string[] = [];
    if (d.events > 0) parts.push(plural(d.events, 'rendez-vous', 'rendez-vous'));
    if (d.tasks > 0) parts.push(plural(d.tasks, 'tâche à faire', 'tâches à faire'));
    if (d.done > 0) parts.push(plural(d.done, 'tâche faite', 'tâches faites'));
    if (d.conflict) parts.push('chevauchement');
    const day = longDate(d.date);
    return parts.length > 0 ? `${day} : ${parts.join(', ')}` : `${day} : rien de prévu`;
  }
}
