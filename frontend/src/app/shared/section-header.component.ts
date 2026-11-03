import { Component, input } from '@angular/core';

/** Titre de section d'une liste, avec compteur facultatif et action projetée à droite. */
@Component({
  selector: 'app-section-header',
  template: `
    <div class="head">
      <h2 [class.warn]="tone() === 'warn'">
        {{ title() }}
        @if (count() !== null) {
          <span class="count ob-num">{{ count() }}</span>
        }
      </h2>
      <ng-content />
    </div>
    @if (hint()) {
      <p class="hint ob-muted">{{ hint() }}</p>
    }
  `,
  styles: `
    .head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      min-height: 32px;
    }
    h2 {
      display: flex;
      align-items: center;
      gap: 8px;
      margin: 0;
      font-size: 1.0625rem;
      font-weight: 650;
      letter-spacing: -0.005em;
    }
    h2.warn {
      color: var(--ob-warn-ink);
    }
    .count {
      min-width: 22px;
      padding: 1px 7px;
      border-radius: 999px;
      background: var(--ob-surface-2);
      color: var(--ob-text-2);
      font-size: 0.75rem;
      font-weight: 700;
      text-align: center;
    }
    .hint {
      margin: 0 0 8px;
      font-size: 0.875rem;
    }
  `,
})
export class SectionHeaderComponent {
  readonly title = input.required<string>();
  readonly count = input<number | null>(null);
  readonly hint = input('');
  readonly tone = input<'default' | 'warn'>('default');
}
