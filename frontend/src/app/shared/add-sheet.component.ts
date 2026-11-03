import { Component, inject } from '@angular/core';
import { IonContent, IonIcon, ModalController } from '@ionic/angular';
import { calendarOutline, checkmarkCircleOutline, flagOutline, repeatOutline, walletOutline } from 'ionicons/icons';

export type AddChoice = 'task' | 'goal' | 'event' | 'money';

/** Feuille « Ajouter » : tuiles des créations disponibles, les prochaines étapes en attente. */
@Component({
  selector: 'app-add-sheet',
  imports: [IonContent, IonIcon],
  styles: `
    ion-content {
      --background: transparent;
    }
    .wrap {
      padding: 22px 16px 24px;
    }
    h2 {
      margin: 0 0 14px;
      font-size: 1.25rem;
    }
    .main {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
    }
    .tile {
      position: relative;
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 8px;
      min-height: 108px;
      padding: 14px;
      border: 1px solid var(--ob-hairline);
      border-radius: var(--ob-radius-lg);
      background: var(--ob-surface);
      color: var(--ob-text);
      font: inherit;
      text-align: left;
      cursor: pointer;
      box-shadow: var(--ob-shadow-sm);
      transition: transform 0.15s var(--ob-ease);
      -webkit-tap-highlight-color: transparent;
    }
    .tile:active:not(:disabled) {
      transform: scale(0.97);
    }
    .tile:disabled {
      border-style: dashed;
      background: transparent;
      box-shadow: none;
      color: var(--ob-text-2);
      cursor: default;
    }
    .tile .ico {
      display: grid;
      place-items: center;
      width: 40px;
      height: 40px;
      border-radius: 13px;
      background: color-mix(in srgb, var(--ion-color-primary) 15%, var(--ob-surface));
      color: var(--ob-primary-ink);
      font-size: 22px;
    }
    .tile:disabled .ico {
      background: var(--ob-surface-2);
      color: var(--ob-text-2);
    }
    .tile strong {
      font-size: 1rem;
    }
    .tile small {
      color: var(--ob-text-2);
      font-size: 0.8125rem;
      line-height: 1.3;
    }
    .soon-title {
      margin: 20px 0 8px;
    }
    .soon {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .soon span {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      min-height: 44px;
      padding: 0 14px;
      border: 1px dashed var(--ob-hairline-strong);
      border-radius: 999px;
      color: var(--ob-text-2);
      font-size: 0.875rem;
      font-weight: 500;
    }
  `,
  template: `
    <ion-content>
      <div class="wrap">
        <h2 class="ob-display">Que veux-tu ajouter ?</h2>
        <div class="main">
          <button type="button" class="tile" (click)="choose('task')">
            <span class="ico"><ion-icon [icon]="icons.task" aria-hidden="true"></ion-icon></span>
            <strong>Une tâche</strong>
            <small>Une action à faire</small>
          </button>
          <button type="button" class="tile" (click)="choose('goal')">
            <span class="ico"><ion-icon [icon]="icons.goal" aria-hidden="true"></ion-icon></span>
            <strong>Un objectif</strong>
            <small>Un cap, étape par étape</small>
          </button>
          <button type="button" class="tile" (click)="choose('event')">
            <span class="ico"><ion-icon [icon]="icons.event" aria-hidden="true"></ion-icon></span>
            <strong>Un événement</strong>
            <small>Réunion, rendez-vous, appel</small>
          </button>
          <button type="button" class="tile" (click)="choose('money')">
            <span class="ico"><ion-icon [icon]="icons.money" aria-hidden="true"></ion-icon></span>
            <strong>Dépense ou revenu</strong>
            <small>Ton budget du mois</small>
          </button>
        </div>
        <p class="ob-eyebrow soon-title">Bientôt disponible</p>
        <div class="soon" aria-label="Fonctions à venir">
          <span><ion-icon [icon]="icons.habit" aria-hidden="true"></ion-icon>Habitude</span>
        </div>
      </div>
    </ion-content>
  `,
})
export class AddSheetComponent {
  private readonly modalCtrl = inject(ModalController);

  protected readonly icons = {
    task: checkmarkCircleOutline,
    goal: flagOutline,
    event: calendarOutline,
    habit: repeatOutline,
    money: walletOutline,
  };

  protected choose(choice: AddChoice): void {
    void this.modalCtrl.dismiss(choice, 'choice');
  }
}
