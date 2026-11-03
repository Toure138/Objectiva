import { Component, input, output } from '@angular/core';
import { IonButton, IonIcon, IonSkeletonText } from '@ionic/angular';
import { cloudOfflineOutline } from 'ionicons/icons';

/** Chargement (squelette), erreur avec « Réessayer », ou contenu. */
@Component({
  selector: 'app-state-view',
  imports: [IonSkeletonText, IonButton, IonIcon],
  styles: `
    .skeleton {
      display: flex;
      flex-direction: column;
      gap: 10px;
      padding-top: 8px;
    }
    .skeleton .hero {
      height: 132px;
      border-radius: var(--ob-radius-lg);
    }
    .skeleton .row {
      height: 68px;
      border-radius: var(--ob-radius-lg);
    }
    .skeleton .title {
      width: 40%;
      height: 20px;
      margin-top: 10px;
    }
    .error {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 12px;
      padding: 48px 24px;
      text-align: center;
    }
    .error .icon {
      display: grid;
      place-items: center;
      width: 72px;
      height: 72px;
      border-radius: 24px;
      background: color-mix(in srgb, var(--ob-danger) 12%, var(--ob-surface));
      color: var(--ob-danger-ink);
      font-size: 32px;
    }
    .error p {
      max-width: 34ch;
      margin: 0;
      font-weight: 500;
    }
  `,
  template: `
    @if (loading()) {
      <div class="skeleton" role="status" aria-live="polite">
        <span class="ob-sr-only">Chargement…</span>
        @if (hero()) {
          <ion-skeleton-text class="hero" [animated]="true"></ion-skeleton-text>
        }
        <ion-skeleton-text class="title" [animated]="true"></ion-skeleton-text>
        @for (n of rows; track n) {
          <ion-skeleton-text class="row" [animated]="true"></ion-skeleton-text>
        }
      </div>
    } @else if (error()) {
      <div class="error" role="alert">
        <div class="icon"><ion-icon [icon]="offlineIcon" aria-hidden="true"></ion-icon></div>
        <p>{{ error() }}</p>
        <ion-button (click)="retry.emit()">Réessayer</ion-button>
      </div>
    } @else {
      <ng-content />
    }
  `,
})
export class StateViewComponent {
  readonly loading = input(false);
  readonly error = input<string | null>(null);
  /** Affiche un grand bloc de tête dans le squelette (écrans avec en-tête illustré). */
  readonly hero = input(false);
  readonly retry = output<void>();

  protected readonly rows = [1, 2, 3, 4];
  protected readonly offlineIcon = cloudOfflineOutline;
}
