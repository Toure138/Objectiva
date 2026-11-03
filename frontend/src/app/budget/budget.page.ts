import { Component } from '@angular/core';
import { IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonContent } from '@ionic/angular';

import { PageHeaderComponent } from '../shared/page-header.component';

/** Espace Budget : livré à l'étape 2 (voir specs/README.md). */
@Component({
  selector: 'app-budget',
  imports: [PageHeaderComponent, IonContent, IonCard, IonCardHeader, IonCardTitle, IonCardContent],
  template: `
    <app-page-header title="Budget" />
    <ion-content>
      <ion-card>
        <ion-card-header><ion-card-title>Bientôt disponible</ion-card-title></ion-card-header>
        <ion-card-content>
          <p>
            Tu pourras ici planifier tes revenus, dépenses et épargne par jour, mois et année, puis comparer tes
            prévisions à tes paiements réels.
          </p>
          <p>Cet espace arrive à la prochaine étape du projet.</p>
        </ion-card-content>
      </ion-card>
    </ion-content>
  `,
})
export class BudgetPage {}
