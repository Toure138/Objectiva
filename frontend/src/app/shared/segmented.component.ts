import { Component, computed, input, model } from '@angular/core';
import { IonIcon } from '@ionic/angular';

export interface SegmentOption {
  value: string;
  label: string;
  /** Icône Ionicons importée, facultative. */
  icon?: string;
}

/** Contrôle segmenté en pilule (groupe de boutons radio accessible, flèches du clavier). */
@Component({
  selector: 'app-segmented',
  imports: [IonIcon],
  template: `
    <div
      class="seg"
      role="radiogroup"
      [attr.aria-label]="ariaLabel()"
      [style.--n]="options().length"
      [style.--idx]="index()"
    >
      <span class="thumb" aria-hidden="true"></span>
      @for (o of options(); track o.value) {
        <button
          type="button"
          role="radio"
          [attr.aria-checked]="o.value === value()"
          [attr.tabindex]="o.value === value() ? 0 : -1"
          [class.on]="o.value === value()"
          (click)="value.set(o.value)"
          (keydown)="onKey($event)"
        >
          @if (o.icon) {
            <ion-icon [icon]="o.icon" aria-hidden="true"></ion-icon>
          }
          <span>{{ o.label }}</span>
        </button>
      }
    </div>
  `,
  styles: `
    :host {
      display: block;
    }
    .seg {
      position: relative;
      display: grid;
      grid-template-columns: repeat(var(--n), 1fr);
      padding: 4px;
      border-radius: 999px;
      background: var(--ob-surface-2);
    }
    .thumb {
      position: absolute;
      top: 4px;
      bottom: 4px;
      left: 4px;
      width: calc((100% - 8px) / var(--n));
      border-radius: 999px;
      background: var(--ob-surface);
      box-shadow: var(--ob-shadow-sm);
      transform: translateX(calc(var(--idx) * 100%));
      transition: transform 0.3s var(--ob-ease);
    }
    button {
      position: relative;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      min-height: 44px;
      padding: 0 8px;
      border: 0;
      border-radius: 999px;
      background: transparent;
      color: var(--ob-text-2);
      font: inherit;
      font-size: 0.875rem;
      font-weight: 600;
      cursor: pointer;
      transition: color 0.2s;
      -webkit-tap-highlight-color: transparent;
    }
    button.on {
      color: var(--ob-text);
    }
    ion-icon {
      font-size: 18px;
    }
  `,
})
export class SegmentedComponent {
  readonly options = input.required<SegmentOption[]>();
  readonly value = model.required<string>();
  readonly ariaLabel = input('');

  protected readonly index = computed(() =>
    Math.max(
      0,
      this.options().findIndex((o) => o.value === this.value()),
    ),
  );

  protected onKey(event: KeyboardEvent): void {
    const step =
      event.key === 'ArrowRight' || event.key === 'ArrowDown'
        ? 1
        : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
          ? -1
          : 0;
    if (!step) return;
    event.preventDefault();
    const list = this.options();
    const next = list[(this.index() + step + list.length) % list.length];
    this.value.set(next.value);
    // Le focus suit la sélection (navigation au clavier).
    const buttons = (event.currentTarget as HTMLElement).parentElement?.querySelectorAll('button');
    setTimeout(() => buttons?.[list.indexOf(next)]?.focus());
  }
}
