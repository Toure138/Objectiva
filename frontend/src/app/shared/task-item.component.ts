import { Component, computed, inject, input, output, signal } from '@angular/core';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { IonCheckbox, IonIcon } from '@ionic/angular';
import {
  alarmOutline,
  calendarOutline,
  checkmarkCircle,
  closeCircleOutline,
  ellipsisHorizontal,
  refreshOutline,
  repeatOutline,
} from 'ionicons/icons';

import { relativeDay } from '../core/dates';
import type { Task } from '../core/models';

import { TaskActionsService } from './task-actions.service';

/** Carte d'une tâche : case à cocher, titre, pastilles de statut (libellé + icône) et menu de report. */
@Component({
  selector: 'app-task-item',
  imports: [IonCheckbox, IonIcon],
  styles: `
    :host {
      display: block;
    }
    .task {
      display: flex;
      align-items: center;
      gap: 4px;
      margin-bottom: 8px;
      padding: 6px 4px 6px 8px;
      background: var(--ob-surface);
      border: 1px solid var(--ob-hairline);
      border-radius: var(--ob-radius-lg);
      box-shadow: var(--ob-shadow-sm);
      transition:
        background-color 0.25s,
        opacity 0.25s;
    }
    .task.is-done,
    .task.is-cancelled {
      background: color-mix(in srgb, var(--ob-surface) 60%, transparent);
      box-shadow: none;
    }
    ion-checkbox {
      flex: none;
      /* Zone tactile de 44 px autour de la case de 26 px. */
      padding: 9px;
    }
    .body {
      flex: 1;
      min-width: 0;
      padding: 6px 4px;
    }
    .title {
      margin: 0;
      font-size: 1rem;
      font-weight: 550;
      line-height: 1.35;
      overflow-wrap: anywhere;
    }
    .is-done .title,
    .is-cancelled .title {
      color: var(--ob-text-2);
      text-decoration: line-through;
      text-decoration-thickness: 1.5px;
    }
    .meta {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-top: 6px;
    }
    .meta:empty {
      display: none;
    }
    .more {
      display: grid;
      flex: none;
      place-items: center;
      width: 44px;
      height: 44px;
      padding: 0;
      border: 0;
      border-radius: 50%;
      background: transparent;
      color: var(--ob-text-2);
      font-size: 20px;
      cursor: pointer;
      -webkit-tap-highlight-color: transparent;
    }
    .more:active:not(:disabled) {
      background: var(--ob-surface-2);
    }
    .more:disabled {
      opacity: 0.4;
    }
  `,
  template: `
    @let t = task();
    <article
      class="task ob-rise"
      [class.is-done]="t.status === 'DONE'"
      [class.is-cancelled]="t.status === 'CANCELLED'"
      [style.--i]="index()"
    >
      <ion-checkbox
        [checked]="t.status === 'DONE'"
        [disabled]="busy() || t.status === 'CANCELLED'"
        (ionChange)="toggle()"
        [attr.aria-label]="t.status === 'DONE' ? 'Marquer comme à faire : ' + t.title : 'Cocher : ' + t.title"
      ></ion-checkbox>
      <div class="body">
        <p class="title">{{ t.title }}</p>
        <div class="meta">
          @if (showDate()) {
            <span class="ob-chip"
              ><ion-icon [icon]="icons.calendar" aria-hidden="true"></ion-icon>{{ dateLabel() }}</span
            >
          }
          @if (t.status === 'DONE') {
            <span class="ob-chip ob-chip--ok"
              ><ion-icon [icon]="icons.done" aria-hidden="true"></ion-icon>Terminée</span
            >
          }
          @if (t.status === 'CANCELLED') {
            <span class="ob-chip"><ion-icon [icon]="icons.cancelled" aria-hidden="true"></ion-icon>Annulée</span>
          }
          @if (t.needsRescheduling) {
            <span class="ob-chip ob-chip--warn"
              ><ion-icon [icon]="icons.replan" aria-hidden="true"></ion-icon>À replanifier</span
            >
          }
          @if (t.overdue) {
            <span class="ob-chip ob-chip--danger"
              ><ion-icon [icon]="icons.late" aria-hidden="true"></ion-icon>En retard</span
            >
          }
          @if (t.rescheduleCount > 0) {
            <span class="ob-chip"
              ><ion-icon [icon]="icons.repeat" aria-hidden="true"></ion-icon>Reportée {{ t.rescheduleCount }}×</span
            >
          }
        </div>
      </div>
      @if (t.status === 'TODO') {
        <button
          type="button"
          class="more"
          (click)="reschedule()"
          [disabled]="busy()"
          [attr.aria-label]="'Reporter ou annuler : ' + t.title"
        >
          <ion-icon [icon]="icons.more" aria-hidden="true"></ion-icon>
        </button>
      }
    </article>
  `,
})
export class TaskItemComponent {
  private readonly actions = inject(TaskActionsService);

  readonly task = input.required<Task>();
  readonly showDate = input(true);
  /** Rang dans la liste : décale l'animation d'apparition. */
  readonly index = input(0);
  readonly changed = output<void>();

  protected readonly busy = signal(false);
  protected readonly icons = {
    calendar: calendarOutline,
    done: checkmarkCircle,
    cancelled: closeCircleOutline,
    replan: refreshOutline,
    late: alarmOutline,
    repeat: repeatOutline,
    more: ellipsisHorizontal,
  };
  protected readonly dateLabel = computed(() => {
    const t = this.task();
    const work = relativeDay(t.workDate);
    return t.dueDate ? `${work} · échéance ${relativeDay(t.dueDate)}` : work;
  });

  // `busy` bloque le double appui pendant l'appel au serveur.
  protected async toggle(): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    // Retour tactile léger sur mobile ; sans effet (et sans erreur) dans un navigateur.
    void Haptics.impact({ style: ImpactStyle.Light }).catch(() => undefined);
    await this.actions.toggle(this.task(), () => this.changed.emit());
    this.busy.set(false);
  }

  protected async reschedule(): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    await this.actions.reschedule(this.task(), () => this.changed.emit());
    this.busy.set(false);
  }
}
