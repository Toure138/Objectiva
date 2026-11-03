import type { OnInit } from '@angular/core';
import { Component, Input, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  AlertController,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonInput,
  IonItem,
  IonList,
  IonNote,
  IonSelect,
  IonSelectOption,
  IonText,
  IonTitle,
  IonToolbar,
  ModalController,
} from '@ionic/angular';
import { add, close } from 'ionicons/icons';

import type { FieldError } from '../core/api-error';
import { ApiError } from '../core/api-error';
import { ApiService } from '../core/api.service';
import { localToday } from '../core/dates';
import type { BudgetMonth, MoneyType } from '../core/models';
import { currencySymbol, newIdempotencyKey, parseMoney } from '../core/money';

import { SegmentedComponent, type SegmentOption } from './segmented.component';

type Mode = 'REAL' | 'PLANNED';

/**
 * Ajout d'une opération du budget : déjà payée (transaction réelle) ou à venir (prévision).
 * La clé d'idempotence est créée à l'ouverture : un nouvel essai après une erreur réseau ne peut pas doubler l'écriture.
 */
@Component({
  selector: 'app-money-form',
  imports: [
    FormsModule,
    SegmentedComponent,
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
    IonText,
    IonNote,
  ],
  styles: `
    .seg {
      margin-bottom: 12px;
    }
    .newcat {
      margin: -4px 0 12px;
    }
    .unit {
      color: var(--ob-text-2);
      font-weight: 600;
    }
  `,
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-button (click)="dismiss()" aria-label="Fermer">
            <ion-icon slot="icon-only" [icon]="icons.close"></ion-icon>
          </ion-button>
        </ion-buttons>
        <ion-title>Dépense ou revenu</ion-title>
        <ion-buttons slot="end">
          <ion-button strong (click)="save()" [disabled]="saving() || loading()">Enregistrer</ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>
    <ion-content class="ion-padding">
      <form (ngSubmit)="save()">
        <div class="seg">
          <app-segmented
            [options]="modes"
            [value]="mode()"
            (valueChange)="setMode($event)"
            ariaLabel="Déjà payé ou à venir"
          />
        </div>
        <div class="seg">
          <app-segmented
            [options]="types"
            [value]="type()"
            (valueChange)="setType($event)"
            ariaLabel="Type d’opération"
          />
        </div>

        <ion-list class="ob-form" lines="none">
          <ion-item>
            <ion-input
              [label]="mode() === 'PLANNED' ? 'Libellé' : 'Libellé (facultatif)'"
              labelPlacement="stacked"
              [(ngModel)]="label"
              name="label"
              [maxlength]="120"
              placeholder="Ex. Transport et impression"
            ></ion-input>
          </ion-item>
          @if (fieldError('label'); as msg) {
            <ion-note color="danger" class="ion-padding-start">{{ msg }}</ion-note>
          }
          <ion-item>
            <ion-input
              label="Montant"
              labelPlacement="stacked"
              inputmode="decimal"
              [(ngModel)]="amountText"
              name="amount"
              placeholder="0"
            >
              <span slot="end" class="unit">{{ symbol() }}</span>
            </ion-input>
          </ion-item>
          @if (amountError(); as msg) {
            <ion-note color="danger" class="ion-padding-start">{{ msg }}</ion-note>
          }
          <ion-item>
            <ion-input
              [label]="mode() === 'PLANNED' ? 'Échéance' : 'Date'"
              labelPlacement="stacked"
              type="date"
              [(ngModel)]="date"
              name="date"
            ></ion-input>
          </ion-item>
          <ion-item>
            <ion-select
              label="Catégorie"
              labelPlacement="stacked"
              [(ngModel)]="categoryId"
              name="categoryId"
              placeholder="Aucune"
              interface="action-sheet"
            >
              <ion-select-option [value]="null">Aucune</ion-select-option>
              @for (c of categories(); track c.id) {
                <ion-select-option [value]="c.id">{{ c.name }}</ion-select-option>
              }
            </ion-select>
          </ion-item>
          <ion-button class="newcat ob-soft" size="small" (click)="newCategory()">
            <ion-icon slot="start" [icon]="icons.add" aria-hidden="true"></ion-icon>Nouvelle catégorie
          </ion-button>
          @if (mode() === 'REAL') {
            <ion-item>
              <ion-select
                label="Compte"
                labelPlacement="stacked"
                [(ngModel)]="accountId"
                name="accountId"
                interface="action-sheet"
              >
                @for (a of accounts(); track a.id) {
                  <ion-select-option [value]="a.id">{{ a.name }}</ion-select-option>
                }
              </ion-select>
            </ion-item>
          }
        </ion-list>

        @if (error()) {
          <ion-text color="danger"
            ><p role="alert">{{ error() }}</p></ion-text
          >
        }
        <ion-button expand="block" type="submit" class="ion-margin-top" [disabled]="saving() || loading()">
          Enregistrer
        </ion-button>
      </form>
    </ion-content>
  `,
})
export class MoneyFormComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly modalCtrl = inject(ModalController);
  private readonly alerts = inject(AlertController);

  // `@Input()` classiques : Ionic affecte `componentProps` directement (voir task-form).
  @Input() presetMonth: string | null = null;
  @Input() presetMode: Mode = 'REAL';
  @Input() presetType: MoneyType = 'DEPENSE';

  protected readonly icons = { close, add };
  protected readonly modes: SegmentOption[] = [
    { value: 'REAL', label: 'Déjà payé' },
    { value: 'PLANNED', label: 'À venir' },
  ];
  protected readonly types: SegmentOption[] = [
    { value: 'DEPENSE', label: 'Dépense' },
    { value: 'REVENU', label: 'Revenu' },
    { value: 'EPARGNE', label: 'Épargne' },
  ];

  protected readonly mode = signal<Mode>('REAL');
  protected readonly type = signal<MoneyType>('DEPENSE');
  protected readonly data = signal<BudgetMonth | null>(null);
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly amountError = signal<string | null>(null);
  private readonly fields = signal<FieldError[]>([]);

  protected label = '';
  protected amountText = '';
  protected date = localToday();
  protected categoryId: string | null = null;
  protected accountId: string | null = null;

  private readonly key = newIdempotencyKey();
  protected readonly currency = computed(() => this.data()?.currency ?? 'XOF');
  protected readonly symbol = computed(() => currencySymbol(this.currency()));
  protected readonly accounts = computed(() => this.data()?.accounts ?? []);
  protected readonly categories = computed(() => (this.data()?.categories ?? []).filter((c) => c.type === this.type()));

  async ngOnInit(): Promise<void> {
    this.mode.set(this.presetMode);
    this.type.set(this.presetType);
    const month = this.presetMonth ?? localToday().slice(0, 7);
    // Hors du mois affiché : l'échéance proposée reste dans ce mois.
    if (this.presetMonth && !localToday().startsWith(this.presetMonth)) this.date = `${this.presetMonth}-01`;
    try {
      let d = await this.api.budgetMonth(month);
      if (d.needsSetup) {
        // Premier passage : un compte « Espèces » et des catégories par défaut (idempotent côté serveur).
        await this.api.budgetSetup();
        d = await this.api.budgetMonth(month);
      }
      this.data.set(d);
      this.accountId = d.accounts[0]?.id ?? null;
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'Chargement impossible');
    } finally {
      this.loading.set(false);
    }
  }

  protected setMode(mode: string): void {
    this.mode.set(mode as Mode);
  }

  protected setType(type: string): void {
    this.type.set(type as MoneyType);
    this.categoryId = null;
  }

  protected fieldError(field: string): string | undefined {
    return this.fields().find((f) => f.field === field)?.message;
  }

  protected dismiss(): void {
    void this.modalCtrl.dismiss(null, 'cancel');
  }

  protected async newCategory(): Promise<void> {
    const alert = await this.alerts.create({
      header: 'Nouvelle catégorie',
      inputs: [{ name: 'name', placeholder: 'Ex. Fournitures', attributes: { maxlength: 60 } }],
      buttons: [
        { text: 'Fermer', role: 'cancel' },
        { text: 'Créer', role: 'confirm' },
      ],
    });
    await alert.present();
    const { role, data } = await alert.onWillDismiss<{ values: { name: string } }>();
    const name = data?.values.name.trim();
    if (role !== 'confirm' || !name) return;
    try {
      const created = await this.api.createBudgetCategory({ name, type: this.type() });
      this.data.update((d) => (d ? { ...d, categories: [...d.categories, created] } : d));
      this.categoryId = created.id;
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'Création impossible');
    }
  }

  protected async save(): Promise<void> {
    if (this.saving()) return;
    this.error.set(null);
    this.amountError.set(null);
    this.fields.set([]);

    const amount = parseMoney(this.amountText, this.currency());
    if (amount === null || amount <= 0) {
      this.amountError.set(
        this.currency() === 'XOF'
          ? 'Saisis un montant entier, par exemple 15000.'
          : 'Saisis un montant valide, par exemple 12,50.',
      );
      return;
    }
    if (this.mode() === 'PLANNED' && !this.label.trim()) {
      this.fields.set([{ field: 'label', message: 'Le libellé est obligatoire' }]);
      return;
    }
    if (this.mode() === 'REAL' && !this.accountId) {
      this.error.set('Choisis un compte pour enregistrer cette opération.');
      return;
    }

    this.saving.set(true);
    try {
      const saved =
        this.mode() === 'REAL'
          ? await this.api.createTransaction({
              type: this.type(),
              amount,
              date: this.date,
              accountId: this.accountId,
              categoryId: this.categoryId,
              label: this.label.trim() || null,
              idempotencyKey: this.key,
            })
          : await this.api.createOperation({
              type: this.type(),
              label: this.label.trim(),
              plannedAmount: amount,
              dueDate: this.date,
              categoryId: this.categoryId,
            });
      await this.modalCtrl.dismiss(saved, 'saved');
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'Échec de l’enregistrement');
      if (e instanceof ApiError) this.fields.set(e.fields);
      this.saving.set(false);
    }
  }
}
