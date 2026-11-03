import { Component, computed, input } from '@angular/core';
import { IonIcon } from '@ionic/angular';
import {
  briefcaseOutline,
  heartOutline,
  peopleOutline,
  rocketOutline,
  schoolOutline,
  sparklesOutline,
  walletOutline,
} from 'ionicons/icons';

import type { GoalCategory } from '../core/models';

const ICONS: Record<GoalCategory, string> = {
  ETUDES: schoolOutline,
  CARRIERE: briefcaseOutline,
  SANTE: heartOutline,
  FINANCES: walletOutline,
  SPIRITUALITE: sparklesOutline,
  FAMILLE: peopleOutline,
  PROJET_PERSONNEL: rocketOutline,
};

/** Classe CSS portant les couleurs de la catégorie (`--cat`, `--cat-soft`, `--cat-ink`). */
export function categoryClass(category: GoalCategory): string {
  return `ob-cat ob-cat--${category.toLowerCase()}`;
}

/** Pastille colorée avec l'icône de la catégorie (décorative : le libellé est écrit à côté). */
@Component({
  selector: 'app-category-badge',
  imports: [IonIcon],
  template: `<span [class]="cls()" [style.--s]="size() + 'px'"
    ><ion-icon [icon]="icon()" aria-hidden="true"></ion-icon
  ></span>`,
  styles: `
    :host {
      display: inline-flex;
    }
    .badge {
      display: grid;
      place-items: center;
      width: var(--s);
      height: var(--s);
      border-radius: calc(var(--s) * 0.32);
      background: var(--cat-soft);
      color: var(--cat-ink);
      font-size: calc(var(--s) * 0.52);
    }
  `,
})
export class CategoryBadgeComponent {
  readonly category = input.required<GoalCategory>();
  readonly size = input(44);

  protected readonly icon = computed(() => ICONS[this.category()]);
  protected readonly cls = computed(() => `badge ${categoryClass(this.category())}`);
}
