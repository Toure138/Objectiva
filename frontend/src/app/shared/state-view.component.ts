import { Component, input, output } from '@angular/core';
import { IonButton, IonIcon, IonSpinner, IonText } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { cloudOfflineOutline } from 'ionicons/icons';

/** Chargement, erreur avec « Réessayer », ou contenu. */
@Component({
  selector: 'app-state-view',
  imports: [IonSpinner, IonButton, IonText, IonIcon],
  styles: `
    .center {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 12px;
      padding: 48px 24px;
      text-align: center;
    }
    ion-icon {
      font-size: 40px;
      color: var(--ion-color-medium);
    }
  `,
  template: `
    @if (loading()) {
      <div class="center" role="status"><ion-spinner name="crescent"></ion-spinner><span>Chargement…</span></div>
    } @else if (error()) {
      <div class="center" role="alert">
        <ion-icon name="cloud-offline-outline" aria-hidden="true"></ion-icon>
        <ion-text color="danger">{{ error() }}</ion-text>
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
  readonly retry = output<void>();

  constructor() {
    addIcons({ cloudOfflineOutline });
  }
}
