import { Component, computed, inject, input, output, signal } from '@angular/core';
import { IonButton, IonCheckbox, IonIcon, IonItem, IonLabel, IonNote } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { alarmOutline, ellipsisHorizontal, refreshOutline, closeCircleOutline, checkmarkCircle } from 'ionicons/icons';

import { relativeDay } from '../core/dates';
import type { Task } from '../core/models';

import { TaskActionsService } from './task-actions.service';

@Component({
  selector: 'app-task-item',
  imports: [IonItem, IonCheckbox, IonLabel, IonNote, IonButton, IonIcon],
  styles: `
    .done {
      text-decoration: line-through;
      color: var(--ion-color-medium);
    }
    .badges {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-top: 4px;
    }
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 3px;
      font-size: 0.8rem;
    }
    .badge.warn {
      color: var(--ion-color-warning-shade);
    }
    .badge.danger {
      color: var(--ion-color-danger);
    }
    ion-checkbox {
      margin-inline-end: 12px;
    }
  `,
  template: `
    @let t = task();
    <ion-item lines="full">
      <ion-checkbox
        slot="start"
        [checked]="t.status === 'DONE'"
        [disabled]="busy() || t.status === 'CANCELLED'"
        (ionChange)="toggle()"
        [attr.aria-label]="t.status === 'DONE' ? 'Marquer comme à faire : ' + t.title : 'Cocher : ' + t.title"
      ></ion-checkbox>
      <ion-label class="ion-text-wrap">
        <div [class.done]="t.status !== 'TODO'">{{ t.title }}</div>
        <div class="badges">
          @if (showDate()) {
            <ion-note class="badge">{{ dateLabel() }}</ion-note>
          }
          @if (t.status === 'DONE') {
            <span class="badge"><ion-icon name="checkmark-circle" aria-hidden="true"></ion-icon>Terminée</span>
          }
          @if (t.status === 'CANCELLED') {
            <span class="badge"><ion-icon name="close-circle-outline" aria-hidden="true"></ion-icon>Annulée</span>
          }
          @if (t.needsRescheduling) {
            <span class="badge warn"><ion-icon name="refresh-outline" aria-hidden="true"></ion-icon>À replanifier</span>
          }
          @if (t.overdue) {
            <span class="badge danger"><ion-icon name="alarm-outline" aria-hidden="true"></ion-icon>En retard</span>
          }
          @if (t.rescheduleCount > 0) {
            <ion-note class="badge">Reportée {{ t.rescheduleCount }}×</ion-note>
          }
        </div>
      </ion-label>
      @if (t.status === 'TODO') {
        <ion-button slot="end" fill="clear" (click)="reschedule()" [disabled]="busy()" aria-label="Reporter ou annuler">
          <ion-icon slot="icon-only" name="ellipsis-horizontal"></ion-icon>
        </ion-button>
      }
    </ion-item>
  `,
})
export class TaskItemComponent {
  private readonly actions = inject(TaskActionsService);

  readonly task = input.required<Task>();
  readonly showDate = input(true);
  readonly changed = output<void>();

  protected readonly busy = signal(false);
  protected readonly dateLabel = computed(() => {
    const t = this.task();
    const work = relativeDay(t.workDate);
    return t.dueDate ? `${work} · échéance ${relativeDay(t.dueDate)}` : work;
  });

  constructor() {
    addIcons({ alarmOutline, ellipsisHorizontal, refreshOutline, closeCircleOutline, checkmarkCircle });
  }

  // `busy` bloque le double appui pendant l'appel au serveur.
  protected async toggle(): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
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
