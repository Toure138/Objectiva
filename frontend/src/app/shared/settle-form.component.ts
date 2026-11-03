import type { OnInit } from '@angular/core';
import { Component, Input, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  IonButton,
  IonButtons,
  IonCheckbox,
  IonContent,
  IonHeader,
  IonIcon,
  IonInput,
  IonItem,
  IonList,
  IonSelect,
  IonSelectOption,
  IonText,
  IonTitle,
  IonToolbar,
  ModalController,
} from '@ionic/angular';
import { close } from 'ionicons/icons';

import { ApiService } from '../core/api.service';
import { localToday } from '../core/dates';
import type { BudgetAccount, BudgetOperation } from '../core/models';
import { currencySymbol, formatMoney, newIdempotencyKey, parseMoney, toInputValue } from '../core/money';

/**
 * Règlement d'une prévision, en une ou plusieurs fois. La clé d'idempotence est créée à l'ouverture :
 * si la réponse se perd et que tu rappuies, le serveur reconnaît la demande et ne l'enregistre pas deux fois.
 */
@Component({
  selector: 'app-settle-form',
  imports: [
    FormsModule,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonButton,
    IonIcon,
    IonContent,
    IonList,
    IonItem,
    IonInput,
    IonSelect,
    IonSelectOption,
    IonCheckbox,
    IonText,
  ],
  styles: `
    .recap {
      margin: 0 0 16px;
      padding: 14px 16px;
    }
    .recap h2 {
      margin: 0 0 4px;
      font-size: 1.125rem;
    }
    .recap p {
      margin: 0;
    }
    .unit {
      color: var(--ob-text-2);
      font-weight: 600;
    }
    .close-line {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      margin: 4px 0 8px;
      padding: 12px 14px;
      border-radius: var(--ob-radius-md);
      background: color-mix(in srgb, var(--ion-color-primary) 10%, var(--ob-surface));
    }
    .close-line .close-text {
      flex: 1;
      line-height: 1.35;
    }
    .close-line small {
      display: block;
      color: var(--ob-text-2);
    }
  `,
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-button (click)="dismiss()" aria-label="Fermer">
            <ion-icon slot="icon-only" [icon]="closeIcon"></ion-icon>
          </ion-button>
        </ion-buttons>
        <ion-title>Régler</ion-title>
        <ion-buttons slot="end">
          <ion-button strong (click)="save()" [disabled]="saving()">Enregistrer</ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>
    <ion-content class="ion-padding">
      <div class="recap ob-card">
        <h2 class="ob-display">{{ operation.label }}</h2>
        <p class="ob-muted">
          Prévu {{ money(operation.plannedAmount) }} · déjà payé {{ money(operation.paid) }} · reste
          {{ money(operation.remaining) }}
        </p>
      </div>

      <form (ngSubmit)="save()">
        <ion-list class="ob-form" lines="none">
          <ion-item>
            <ion-input
              label="Montant réglé"
              labelPlacement="stacked"
              inputmode="decimal"
              [(ngModel)]="amountText"
              name="amount"
            >
              <span slot="end" class="unit">{{ symbol() }}</span>
            </ion-input>
          </ion-item>
          <ion-item>
            <ion-select
              label="Compte"
              labelPlacement="stacked"
              [(ngModel)]="accountId"
              name="accountId"
              interface="action-sheet"
            >
              @for (a of accounts; track a.id) {
                <ion-select-option [value]="a.id">{{ a.name }}</ion-select-option>
              }
            </ion-select>
          </ion-item>
          <ion-item>
            <ion-input
              label="Date du paiement"
              labelPlacement="stacked"
              type="date"
              [(ngModel)]="date"
              name="date"
            ></ion-input>
          </ion-item>
        </ion-list>

        <div class="close-line">
          <ion-checkbox [(ngModel)]="close" name="close" aria-labelledby="close-label"></ion-checkbox>
          <span id="close-label" class="close-text">
            Solder cette prévision
            <small>Si tu paies moins que prévu, la différence sera comptée comme une économie.</small>
          </span>
        </div>

        @if (error()) {
          <ion-text color="danger"
            ><p role="alert">{{ error() }}</p></ion-text
          >
        }
        <ion-button expand="block" type="submit" class="ion-margin-top" [disabled]="saving()"
          >Enregistrer le paiement</ion-button
        >
      </form>
    </ion-content>
  `,
})
export class SettleFormComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly modalCtrl = inject(ModalController);

  // `@Input()` classiques : Ionic affecte `componentProps` directement (voir task-form).
  @Input({ required: true }) operation!: BudgetOperation;
  @Input() currency = 'XOF';
  @Input() accounts: BudgetAccount[] = [];

  protected readonly closeIcon = close;
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly symbol = computed(() => currencySymbol(this.currency));

  protected amountText = '';
  protected accountId: string | null = null;
  protected date = localToday();
  protected close = false;

  private readonly key = newIdempotencyKey();

  ngOnInit(): void {
    this.amountText = toInputValue(this.operation.remaining, this.currency);
    this.accountId = this.operation.accountId ?? this.accounts[0]?.id ?? null;
  }

  protected money(minor: number): string {
    return formatMoney(minor, this.currency);
  }

  protected dismiss(): void {
    void this.modalCtrl.dismiss(null, 'cancel');
  }

  protected async save(): Promise<void> {
    if (this.saving()) return;
    this.error.set(null);
    const amount = parseMoney(this.amountText, this.currency);
    if (amount === null || amount <= 0) {
      this.error.set('Saisis un montant valide, supérieur à zéro.');
      return;
    }
    if (!this.accountId) {
      this.error.set('Choisis le compte utilisé pour ce paiement.');
      return;
    }
    this.saving.set(true);
    try {
      const result = await this.api.settleOperation(this.operation.id, {
        amount,
        accountId: this.accountId,
        date: this.date,
        close: this.close,
        idempotencyKey: this.key,
      });
      await this.modalCtrl.dismiss(result, 'saved');
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'Échec de l’enregistrement');
      this.saving.set(false);
    }
  }
}
