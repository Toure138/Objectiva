import { Component, input } from '@angular/core';
import { IonIcon } from '@ionic/angular';

/** Écran vide encourageant : icône, titre, message et (projeté) une action. */
@Component({
  selector: 'app-empty-state',
  imports: [IonIcon],
  template: `
    <div class="empty ob-rise">
      <div class="icon"><ion-icon [icon]="icon()" aria-hidden="true"></ion-icon></div>
      <h3 class="ob-display">{{ title() }}</h3>
      @if (message()) {
        <p class="ob-muted">{{ message() }}</p>
      }
      <div class="actions"><ng-content /></div>
    </div>
  `,
  styles: `
    .empty {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 32px 24px;
      text-align: center;
    }
    .icon {
      display: grid;
      place-items: center;
      width: 72px;
      height: 72px;
      margin-bottom: 16px;
      border-radius: 24px;
      background: color-mix(in srgb, var(--ion-color-primary) 12%, var(--ob-surface));
      color: var(--ob-primary-ink);
      font-size: 32px;
    }
    h3 {
      margin: 0 0 6px;
      font-size: 1.25rem;
    }
    p {
      max-width: 32ch;
      margin: 0 0 16px;
    }
    .actions:empty {
      display: none;
    }
  `,
})
export class EmptyStateComponent {
  /** Icône Ionicons importée (ex. `leafOutline`), pas un nom. */
  readonly icon = input.required<string>();
  readonly title = input.required<string>();
  readonly message = input('');
}
