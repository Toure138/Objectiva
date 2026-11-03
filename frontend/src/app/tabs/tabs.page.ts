import { Component, signal } from '@angular/core';
import { IonIcon, IonLabel, IonTabBar, IonTabButton, IonTabs } from '@ionic/angular';
import {
  calendar,
  calendarOutline,
  flag,
  flagOutline,
  statsChart,
  statsChartOutline,
  sunny,
  sunnyOutline,
  wallet,
  walletOutline,
} from 'ionicons/icons';

interface Tab {
  id: string;
  label: string;
  outline: string;
  filled: string;
}

@Component({
  selector: 'app-tabs',
  imports: [IonTabs, IonTabBar, IonTabButton, IonIcon, IonLabel],
  template: `
    <ion-tabs (ionTabsDidChange)="current.set($event.tab)">
      <ion-tab-bar slot="bottom">
        @for (t of tabs; track t.id) {
          <ion-tab-button [tab]="t.id" [href]="'/app/' + t.id">
            <ion-icon aria-hidden="true" [icon]="current() === t.id ? t.filled : t.outline"></ion-icon>
            <ion-label>{{ t.label }}</ion-label>
          </ion-tab-button>
        }
      </ion-tab-bar>
    </ion-tabs>
  `,
})
export class TabsPage {
  // Libellés courts : 5 onglets doivent tenir sur 360 px.
  protected readonly tabs: Tab[] = [
    { id: 'aujourdhui', label: "Aujourd'hui", outline: sunnyOutline, filled: sunny },
    { id: 'planifier', label: 'Planifier', outline: calendarOutline, filled: calendar },
    { id: 'objectifs', label: 'Objectifs', outline: flagOutline, filled: flag },
    { id: 'budget', label: 'Budget', outline: walletOutline, filled: wallet },
    { id: 'bilan', label: 'Bilan', outline: statsChartOutline, filled: statsChart },
  ];
  protected readonly current = signal<string>(location.pathname.split('/')[2] ?? 'aujourdhui');
}
