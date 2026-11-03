import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IonButton, IonButtons, IonHeader, IonIcon, IonTitle, IonToolbar } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { personCircleOutline } from 'ionicons/icons';

/** En-tête commun : titre et accès au profil (paramètres). */
@Component({
  selector: 'app-page-header',
  imports: [IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonIcon, RouterLink],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-title>{{ title() }}</ion-title>
        <ion-buttons slot="end">
          <ion-button routerLink="/profil" aria-label="Profil et paramètres">
            <ion-icon slot="icon-only" name="person-circle-outline"></ion-icon>
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>
  `,
})
export class PageHeaderComponent {
  readonly title = input.required<string>();

  constructor() {
    addIcons({ personCircleOutline });
  }
}
