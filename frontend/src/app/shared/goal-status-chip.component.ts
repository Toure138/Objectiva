import { Component, computed, input } from '@angular/core';
import { IonIcon } from '@ionic/angular';
import {
  checkmarkCircle,
  closeCircleOutline,
  pauseCircleOutline,
  playCircleOutline,
  timeOutline,
} from 'ionicons/icons';

import { GOAL_STATUS_LABELS, type GoalStatus } from '../core/models';

const VISUALS: Record<GoalStatus, { icon: string; cls: string }> = {
  A_DEMARRER: { icon: timeOutline, cls: '' },
  EN_COURS: { icon: playCircleOutline, cls: 'ob-chip--primary' },
  EN_PAUSE: { icon: pauseCircleOutline, cls: '' },
  TERMINE: { icon: checkmarkCircle, cls: 'ob-chip--ok' },
  ABANDONNE: { icon: closeCircleOutline, cls: '' },
};

/** Statut d'un objectif : libellé + icône (la couleur n'est qu'un renfort). */
@Component({
  selector: 'app-goal-status-chip',
  imports: [IonIcon],
  template: `<span class="ob-chip" [class]="visual().cls"
    ><ion-icon [icon]="visual().icon" aria-hidden="true"></ion-icon>{{ label() }}</span
  >`,
  styles: `
    :host {
      display: inline-flex;
    }
  `,
})
export class GoalStatusChipComponent {
  readonly status = input.required<GoalStatus>();

  protected readonly visual = computed(() => VISUALS[this.status()]);
  protected readonly label = computed(() => GOAL_STATUS_LABELS[this.status()]);
}
