import { Component, computed, input } from '@angular/core';

/**
 * Anneau de progression (affichage seul : la valeur vient de l'API).
 * La couleur se règle avec `--ring-color` sur l'élément parent ; le contenu projeté s'affiche au centre.
 */
@Component({
  selector: 'app-progress-ring',
  template: `
    <div class="ring" role="img" [attr.aria-label]="label()" [style.width.px]="size()" [style.height.px]="size()">
      <svg [attr.viewBox]="'0 0 ' + size() + ' ' + size()" aria-hidden="true" focusable="false">
        <circle
          class="track"
          [attr.cx]="center()"
          [attr.cy]="center()"
          [attr.r]="radius()"
          [attr.stroke-width]="stroke()"
        />
        <circle
          class="bar"
          [attr.cx]="center()"
          [attr.cy]="center()"
          [attr.r]="radius()"
          [attr.stroke-width]="stroke()"
          [attr.stroke-dasharray]="circumference()"
          [attr.stroke-dashoffset]="offset()"
          [style.--circ]="circumference()"
          [attr.transform]="'rotate(-90 ' + center() + ' ' + center() + ')'"
        />
      </svg>
      <div class="center" aria-hidden="true"><ng-content /></div>
    </div>
  `,
  styles: `
    :host {
      display: inline-flex;
    }
    .ring {
      position: relative;
    }
    svg {
      display: block;
      width: 100%;
      height: 100%;
    }
    circle {
      fill: none;
    }
    .track {
      stroke: color-mix(in srgb, var(--ring-color, var(--ion-color-primary)) 16%, transparent);
    }
    .bar {
      stroke: var(--ring-color, var(--ion-color-primary));
      stroke-linecap: round;
      animation: draw 0.9s var(--ob-ease) both;
    }
    .center {
      position: absolute;
      inset: 0;
      display: grid;
      place-items: center;
      text-align: center;
    }
    @keyframes draw {
      from {
        stroke-dashoffset: var(--circ);
      }
    }
  `,
})
export class ProgressRingComponent {
  /** Part accomplie, entre 0 et 1. */
  readonly value = input(0);
  readonly size = input(88);
  readonly stroke = input(9);
  /** Description lue par les lecteurs d'écran (l'anneau lui-même est décoratif). */
  readonly label = input('');

  protected readonly center = computed(() => this.size() / 2);
  protected readonly radius = computed(() => (this.size() - this.stroke()) / 2);
  protected readonly circumference = computed(() => 2 * Math.PI * this.radius());
  protected readonly offset = computed(() => this.circumference() * (1 - Math.min(1, Math.max(0, this.value()))));
}
