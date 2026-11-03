import { Component, computed, input } from '@angular/core';

/**
 * Barre de progression (affichage seul : le pourcentage vient de l'API).
 * Prend la couleur de la catégorie (`--cat`) quand elle est dans une carte d'objectif.
 */
@Component({
  selector: 'app-progress-bar',
  template: `
    <div
      class="bar"
      role="progressbar"
      aria-valuemin="0"
      aria-valuemax="100"
      [attr.aria-valuenow]="clamped()"
      [attr.aria-label]="label()"
      [class.thick]="thick()"
    >
      <span [style.width.%]="clamped()"></span>
    </div>
  `,
  styles: `
    :host {
      display: block;
    }
    .bar {
      height: 8px;
      overflow: hidden;
      border-radius: 999px;
      background: color-mix(in srgb, var(--bar-color, var(--cat, var(--ion-color-primary))) 16%, transparent);
    }
    .bar.thick {
      height: 12px;
    }
    span {
      display: block;
      height: 100%;
      min-width: 8px;
      border-radius: inherit;
      background: var(--bar-color, var(--cat, var(--ion-color-primary)));
      transition: width 0.7s var(--ob-ease);
    }
  `,
})
export class ProgressBarComponent {
  /** Pourcentage de 0 à 100. */
  readonly percent = input.required<number>();
  readonly label = input('');
  readonly thick = input(false);

  protected readonly clamped = computed(() => Math.min(100, Math.max(0, Math.round(this.percent()))));
}
