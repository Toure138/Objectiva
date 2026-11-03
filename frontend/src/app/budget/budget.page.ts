import { Component } from '@angular/core';
import { IonContent, IonIcon } from '@ionic/angular';
import { calendarNumberOutline, calendarOutline, sunnyOutline, walletOutline } from 'ionicons/icons';

import { PageHeaderComponent } from '../shared/page-header.component';

/** Espace Budget : livré à l'étape 2 (voir specs/README.md). Page d'attente qui présente ce qui arrive. */
@Component({
  selector: 'app-budget',
  imports: [PageHeaderComponent, IonContent, IonIcon],
  styles: `
    .hero {
      margin-top: 8px;
      padding: 24px 20px;
      border-radius: var(--ob-radius-xl);
      background: linear-gradient(145deg, #1d7a67, #0e4a3f);
      color: #fff;
    }
    .hero .ico {
      display: grid;
      place-items: center;
      width: 52px;
      height: 52px;
      margin-bottom: 14px;
      border-radius: 17px;
      background: rgb(255 255 255 / 0.16);
      font-size: 28px;
    }
    h2 {
      margin: 0 0 6px;
      font-size: 1.5rem;
    }
    .hero p {
      margin: 0;
      opacity: 0.88;
    }
    .soon {
      margin: 28px 0 10px;
    }
    .views {
      display: grid;
      gap: 10px;
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .views li {
      display: flex;
      align-items: center;
      gap: 14px;
      padding: 14px 16px;
    }
    .views .ico {
      display: grid;
      flex: none;
      place-items: center;
      width: 44px;
      height: 44px;
      border-radius: 14px;
      background: color-mix(in srgb, var(--ion-color-primary) 13%, var(--ob-surface));
      color: var(--ob-primary-ink);
      font-size: 22px;
    }
    .views strong {
      display: block;
    }
    .views small {
      color: var(--ob-text-2);
    }
  `,
  template: `
    <app-page-header title="Budget" eyebrow="Bientôt disponible" />
    <ion-content>
      <div class="ob-container">
        <section class="hero ob-rise">
          <div class="ico"><ion-icon [icon]="icons.wallet" aria-hidden="true"></ion-icon></div>
          <h2 class="ob-display">Ton argent, au clair</h2>
          <p>
            Tu pourras planifier tes revenus, dépenses et épargne, puis comparer tes prévisions à tes paiements réels.
            Cet espace arrive à la prochaine étape du projet.
          </p>
        </section>

        <p class="soon ob-eyebrow">Trois vues pour t’organiser</p>
        <ul class="views">
          <li class="ob-card ob-rise" style="--i: 1">
            <span class="ico"><ion-icon [icon]="icons.day" aria-hidden="true"></ion-icon></span>
            <span><strong>Au jour le jour</strong><small>Ce que tu peux dépenser aujourd’hui</small></span>
          </li>
          <li class="ob-card ob-rise" style="--i: 2">
            <span class="ico"><ion-icon [icon]="icons.month" aria-hidden="true"></ion-icon></span>
            <span><strong>Par mois</strong><small>Enveloppes, prévisions et paiements réels</small></span>
          </li>
          <li class="ob-card ob-rise" style="--i: 3">
            <span class="ico"><ion-icon [icon]="icons.year" aria-hidden="true"></ion-icon></span>
            <span><strong>Sur l’année</strong><small>Le grand tableau, réparti mois par mois</small></span>
          </li>
        </ul>
      </div>
    </ion-content>
  `,
})
export class BudgetPage {
  protected readonly icons = {
    wallet: walletOutline,
    day: sunnyOutline,
    month: calendarOutline,
    year: calendarNumberOutline,
  };
}
