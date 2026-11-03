import { Component } from '@angular/core';
import { IonIcon, IonLabel, IonTabBar, IonTabButton, IonTabs } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { calendarOutline, flagOutline, statsChartOutline, sunnyOutline, walletOutline } from 'ionicons/icons';

@Component({
  selector: 'app-tabs',
  imports: [IonTabs, IonTabBar, IonTabButton, IonIcon, IonLabel],
  template: `
    <ion-tabs>
      <ion-tab-bar slot="bottom">
        <ion-tab-button tab="aujourdhui" href="/app/aujourdhui">
          <ion-icon aria-hidden="true" name="sunny-outline"></ion-icon>
          <ion-label>Aujourd'hui</ion-label>
        </ion-tab-button>
        <ion-tab-button tab="planifier" href="/app/planifier">
          <ion-icon aria-hidden="true" name="calendar-outline"></ion-icon>
          <ion-label>Planifier</ion-label>
        </ion-tab-button>
        <ion-tab-button tab="objectifs" href="/app/objectifs">
          <ion-icon aria-hidden="true" name="flag-outline"></ion-icon>
          <ion-label>Objectifs</ion-label>
        </ion-tab-button>
        <ion-tab-button tab="budget" href="/app/budget">
          <ion-icon aria-hidden="true" name="wallet-outline"></ion-icon>
          <ion-label>Budget</ion-label>
        </ion-tab-button>
        <ion-tab-button tab="bilan" href="/app/bilan">
          <ion-icon aria-hidden="true" name="stats-chart-outline"></ion-icon>
          <ion-label>Bilan</ion-label>
        </ion-tab-button>
      </ion-tab-bar>
    </ion-tabs>
  `,
})
export class TabsPage {
  constructor() {
    addIcons({ sunnyOutline, calendarOutline, flagOutline, walletOutline, statsChartOutline });
  }
}
