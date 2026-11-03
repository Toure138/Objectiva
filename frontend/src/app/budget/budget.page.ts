import { Component, computed, inject, signal } from '@angular/core';
import {
  ActionSheetController,
  AlertController,
  IonButton,
  IonContent,
  IonFab,
  IonFabButton,
  IonIcon,
  IonRefresher,
  IonRefresherContent,
  ModalController,
  ToastController,
  type RefresherCustomEvent,
} from '@ionic/angular';
import {
  add,
  arrowDownCircleOutline,
  arrowUpCircleOutline,
  businessOutline,
  cashOutline,
  chevronBack,
  chevronForward,
  closeCircleOutline,
  phonePortraitOutline,
  trendingUpOutline,
  walletOutline,
  warningOutline,
} from 'ionicons/icons';

import { ApiService } from '../core/api.service';
import { addMonths, localToday, monthLabel, shortDate } from '../core/dates';
import {
  ACCOUNT_KIND_LABELS,
  type AccountKind,
  type BudgetEnvelope,
  type BudgetMonth,
  type BudgetOperation,
  type BudgetTransaction,
} from '../core/models';
import { formatMoney, formatSigned, parseMoney, toInputValue } from '../core/money';
import { AddMenuService } from '../shared/add-menu.service';
import { EmptyStateComponent } from '../shared/empty-state.component';
import { PageHeaderComponent } from '../shared/page-header.component';
import { ProgressBarComponent } from '../shared/progress-bar.component';
import { SectionHeaderComponent } from '../shared/section-header.component';
import { SettleFormComponent } from '../shared/settle-form.component';
import { StateViewComponent } from '../shared/state-view.component';

import { OperationItemComponent } from './operation-item.component';

const ACCOUNT_ICONS: Record<AccountKind, string> = {
  ESPECES: cashOutline,
  BANQUE: businessOutline,
  MOBILE_MONEY: phonePortraitOutline,
};

@Component({
  selector: 'app-budget',
  imports: [
    PageHeaderComponent,
    StateViewComponent,
    SectionHeaderComponent,
    EmptyStateComponent,
    ProgressBarComponent,
    OperationItemComponent,
    IonContent,
    IonButton,
    IonIcon,
    IonFab,
    IonFabButton,
    IonRefresher,
    IonRefresherContent,
  ],
  styles: `
    section {
      margin-top: 28px;
    }
    .months {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 4px 0 8px;
    }
    .months h2 {
      margin: 0;
      font-size: 1.25rem;
    }
    .months ion-button {
      --padding-start: 0;
      --padding-end: 0;
      width: 44px;
      height: 44px;
      color: var(--ob-text);
    }
    .hero {
      padding: 20px;
      background: linear-gradient(
        135deg,
        color-mix(in srgb, var(--ion-color-primary) 15%, var(--ob-surface)),
        var(--ob-surface) 70%
      );
      --bar-color: var(--ion-color-primary);
    }
    .hero.over {
      --bar-color: var(--ob-danger);
    }
    .hero p {
      margin: 0;
    }
    .big {
      margin: 2px 0 12px !important;
      font-size: 2rem;
      line-height: 1.1;
      font-variant-numeric: tabular-nums;
    }
    .hero.over .big {
      color: var(--ob-danger-ink);
    }
    .sub {
      margin-top: 10px !important;
      font-size: 0.875rem;
    }
    .alert-chip {
      margin-top: 10px;
    }
    .stats {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
      margin-top: 10px;
    }
    .stat {
      padding: 14px 16px;
    }
    .stat .l {
      display: flex;
      align-items: center;
      gap: 6px;
      color: var(--ob-text-2);
      font-size: 0.8125rem;
      font-weight: 600;
    }
    .stat .n {
      display: block;
      margin-top: 4px;
      font-family: var(--ob-font-display);
      font-size: 1.1875rem;
      font-weight: 650;
      font-variant-numeric: tabular-nums;
    }
    .stat small {
      color: var(--ob-text-2);
    }
    .amt {
      flex: none;
      font-variant-numeric: tabular-nums;
      font-weight: 650;
    }
    .amt.in {
      color: var(--ob-ok);
    }
    .total {
      margin: 0 4px 0;
      text-align: right;
      font-size: 0.875rem;
    }
    button.env {
      display: block;
      width: 100%;
      margin-bottom: 8px;
      padding: 14px 16px;
      color: inherit;
      font: inherit;
      text-align: left;
      cursor: pointer;
      -webkit-tap-highlight-color: transparent;
    }
    .env .top {
      display: flex;
      flex-wrap: wrap;
      align-items: baseline;
      justify-content: space-between;
      gap: 2px 12px;
      margin-bottom: 10px;
    }
    .env strong {
      font-weight: 600;
    }
    .env .nums {
      color: var(--ob-text-2);
      font-size: 0.875rem;
      font-variant-numeric: tabular-nums;
    }
    .env.over {
      --bar-color: var(--ob-danger);
    }
    .env .chip-line {
      margin-top: 8px;
    }
    .del {
      --padding-start: 0;
      --padding-end: 0;
      width: 44px;
      height: 44px;
      flex: none;
      color: var(--ob-text-2);
    }
    .hint {
      margin: 4px 0 8px;
      color: var(--ob-text-2);
    }
  `,
  template: `
    <app-page-header title="Budget" [eyebrow]="'Mon argent'" />
    <ion-content>
      <ion-refresher slot="fixed" (ionRefresh)="refresh($event)"><ion-refresher-content /></ion-refresher>
      <div class="ob-container">
        <app-state-view [loading]="loading()" [error]="error()" [hero]="true" (retry)="load()">
          @if (data(); as d) {
            @if (d.needsSetup) {
              <app-empty-state
                [icon]="icons.wallet"
                title="Ton argent, au clair"
                message="Démarre ton budget : on crée un compte « Espèces » et des catégories toutes prêtes. Tu pourras tout adapter."
              >
                <ion-button (click)="start()" [disabled]="busy()">Démarrer mon budget</ion-button>
              </app-empty-state>
            } @else {
              <div class="months">
                <ion-button fill="clear" (click)="go(-1)" aria-label="Mois précédent">
                  <ion-icon slot="icon-only" [icon]="icons.prev"></ion-icon>
                </ion-button>
                <h2 class="ob-display">{{ label() }}</h2>
                <ion-button fill="clear" (click)="go(1)" aria-label="Mois suivant">
                  <ion-icon slot="icon-only" [icon]="icons.next"></ion-icon>
                </ion-button>
              </div>

              <div class="hero ob-card ob-rise" [class.over]="d.summary.overspent">
                <p class="ob-eyebrow">{{ d.summary.overspent ? 'Dépassé de' : 'Reste à dépenser' }}</p>
                <p class="big ob-display">
                  {{ money(d.summary.overspent ? -d.summary.remainingToSpend : d.summary.remainingToSpend) }}
                </p>
                @if (d.summary.expensePercent !== null) {
                  <app-progress-bar
                    [percent]="d.summary.expensePercent"
                    [thick]="true"
                    [label]="'Dépenses : ' + d.summary.expensePercent + ' % du prévu'"
                  />
                }
                <p class="sub ob-muted">
                  {{ money(d.summary.realExpense) }} dépensés sur {{ money(d.summary.plannedExpense) }} prévus
                </p>
                @if (d.summary.overspent) {
                  <span class="ob-chip ob-chip--danger alert-chip"
                    ><ion-icon [icon]="icons.warn" aria-hidden="true"></ion-icon>Tu as dépassé ton budget du mois</span
                  >
                }
              </div>

              <div class="stats">
                <div class="stat ob-card ob-rise" style="--i: 1">
                  <span class="l"><ion-icon [icon]="icons.in" aria-hidden="true"></ion-icon>Revenus</span>
                  <span class="n">{{ money(d.summary.realIncome) }}</span>
                  <small>sur {{ money(d.summary.plannedIncome) }} prévus</small>
                </div>
                <div class="stat ob-card ob-rise" style="--i: 2">
                  <span class="l"><ion-icon [icon]="icons.out" aria-hidden="true"></ion-icon>Dépenses</span>
                  <span class="n">{{ money(d.summary.realExpense) }}</span>
                  <small>sur {{ money(d.summary.plannedExpense) }} prévus</small>
                </div>
                <div class="stat ob-card ob-rise" style="--i: 3">
                  <span class="l"><ion-icon [icon]="icons.saving" aria-hidden="true"></ion-icon>Épargne</span>
                  <span class="n">{{ money(d.summary.realSaving) }}</span>
                  <small>sur {{ money(d.summary.plannedSaving) }} prévus</small>
                </div>
                <div class="stat ob-card ob-rise" style="--i: 4">
                  <span class="l">Économies</span>
                  <span class="n">{{ money(d.summary.economy) }}</span>
                  <small>sur prévisions soldées</small>
                </div>
              </div>

              <section>
                <app-section-header title="Mes comptes" [count]="d.accounts.length" />
                @for (a of d.accounts; track a.id) {
                  <div class="ob-row ob-card">
                    <span class="ob-ico"><ion-icon [icon]="accountIcon(a.kind)" aria-hidden="true"></ion-icon></span>
                    <div class="ob-row-txt">
                      <p>{{ a.name }}</p>
                      <small>{{ kindLabel(a.kind) }}</small>
                    </div>
                    <strong class="amt">{{ money(a.balance) }}</strong>
                  </div>
                }
                <p class="total ob-muted">
                  Total : <strong>{{ money(d.totalBalance) }}</strong>
                </p>
              </section>

              <section>
                <app-section-header title="Enveloppes" [count]="d.envelopes.length">
                  <ion-button class="ob-soft" size="small" (click)="chooseEnvelope()">
                    <ion-icon slot="start" [icon]="icons.add" aria-hidden="true"></ion-icon>Définir
                  </ion-button>
                </app-section-header>
                @for (e of d.envelopes; track e.categoryId) {
                  <button
                    type="button"
                    class="env ob-card"
                    [class.over]="e.overspent"
                    (click)="editEnvelope(e)"
                    [attr.aria-label]="'Modifier l’enveloppe ' + e.categoryName"
                  >
                    <span class="top">
                      <strong>{{ e.categoryName }}</strong>
                      <span class="nums">
                        @if (e.planned > 0) {
                          {{ money(e.spent) }} / {{ money(e.planned) }}
                        } @else {
                          {{ money(e.spent) }} dépensés
                        }
                      </span>
                    </span>
                    @if (e.percent !== null) {
                      <app-progress-bar
                        [percent]="e.percent"
                        [label]="e.categoryName + ' : ' + e.percent + ' % du prévu'"
                      />
                    }
                    @if (e.overspent) {
                      <span class="ob-chip ob-chip--danger chip-line"
                        ><ion-icon [icon]="icons.warn" aria-hidden="true"></ion-icon>Dépassé de
                        {{ money(-e.remaining) }}</span
                      >
                    } @else if (e.percent === null) {
                      <span class="ob-chip chip-line">Pas de montant prévu</span>
                    }
                  </button>
                } @empty {
                  <p class="hint">
                    Une enveloppe fixe un montant prévu pour une catégorie sur le mois, par exemple « Transport ».
                  </p>
                }
              </section>

              <section>
                <app-section-header title="Prévisions" [count]="d.operations.length" />
                @for (o of d.operations; track o.id; let i = $index) {
                  <app-operation-item
                    [op]="o"
                    [currency]="d.currency"
                    [categoryName]="catName(o.categoryId)"
                    [index]="i"
                    (settle)="settle(o)"
                    (menu)="menu(o)"
                  />
                } @empty {
                  <p class="hint">
                    Aucune prévision ce mois-ci. Ajoute ce que tu dois payer ou recevoir avec le bouton « + ».
                  </p>
                }
              </section>

              <section>
                <app-section-header title="Opérations réelles" [count]="d.transactions.length" />
                @for (t of d.transactions; track t.id) {
                  <div class="ob-row ob-card">
                    <span class="ob-ico"><ion-icon [icon]="txIcon(t)" aria-hidden="true"></ion-icon></span>
                    <div class="ob-row-txt">
                      <p>{{ t.label || catName(t.categoryId) || 'Opération' }}</p>
                      <small>{{ date(t.date) }} · {{ accountName(t.accountId) }}</small>
                    </div>
                    <strong class="amt" [class.in]="t.type === 'REVENU'">{{ signed(t) }}</strong>
                    <ion-button
                      class="del"
                      fill="clear"
                      (click)="removeTx(t)"
                      [attr.aria-label]="'Supprimer l’opération du ' + date(t.date)"
                    >
                      <ion-icon slot="icon-only" [icon]="icons.remove"></ion-icon>
                    </ion-button>
                  </div>
                } @empty {
                  <p class="hint">Aucune opération réelle ce mois-ci.</p>
                }
              </section>
            }
            <div class="ob-fab-space"></div>
          }
        </app-state-view>
      </div>

      @if (data() && !data()!.needsSetup) {
        <ion-fab slot="fixed" vertical="bottom" horizontal="end">
          <ion-fab-button (click)="add()" aria-label="Ajouter une dépense ou un revenu"
            ><ion-icon [icon]="icons.add"></ion-icon
          ></ion-fab-button>
        </ion-fab>
      }
    </ion-content>
  `,
})
export class BudgetPage {
  private readonly api = inject(ApiService);
  private readonly addMenu = inject(AddMenuService);
  private readonly modals = inject(ModalController);
  private readonly alerts = inject(AlertController);
  private readonly sheets = inject(ActionSheetController);
  private readonly toasts = inject(ToastController);

  protected readonly month = signal(localToday().slice(0, 7));
  protected readonly data = signal<BudgetMonth | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected readonly label = computed(() => monthLabel(this.month()));
  protected readonly icons = {
    add,
    wallet: walletOutline,
    prev: chevronBack,
    next: chevronForward,
    warn: warningOutline,
    in: arrowDownCircleOutline,
    out: arrowUpCircleOutline,
    saving: trendingUpOutline,
    remove: closeCircleOutline,
  };
  protected readonly date = shortDate;

  ionViewWillEnter(): void {
    void this.load();
  }

  async load(): Promise<void> {
    this.error.set(null);
    try {
      this.data.set(await this.api.budgetMonth(this.month()));
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'Chargement impossible');
    } finally {
      this.loading.set(false);
    }
  }

  async refresh(event: RefresherCustomEvent): Promise<void> {
    await this.load();
    await event.target.complete();
  }

  protected go(delta: number): void {
    this.month.set(addMonths(this.month(), delta));
    void this.load();
  }

  protected async start(): Promise<void> {
    await this.run(async () => {
      await this.api.budgetSetup();
      await this.load();
    });
  }

  protected add(): void {
    void this.addMenu.openMoney({ presetMonth: this.month() }, () => void this.load());
  }

  // --- Affichage : formatage seulement, les valeurs viennent de l'API.
  protected money(minor: number): string {
    return formatMoney(minor, this.data()?.currency ?? 'XOF');
  }
  protected signed(t: BudgetTransaction): string {
    return formatSigned(t.amount, this.data()?.currency ?? 'XOF', t.type === 'REVENU');
  }
  protected accountIcon(kind: AccountKind): string {
    return ACCOUNT_ICONS[kind];
  }
  protected kindLabel(kind: AccountKind): string {
    return ACCOUNT_KIND_LABELS[kind];
  }
  protected txIcon(t: BudgetTransaction): string {
    return t.type === 'REVENU'
      ? arrowDownCircleOutline
      : t.type === 'EPARGNE'
        ? trendingUpOutline
        : arrowUpCircleOutline;
  }
  protected catName(id: string | null): string {
    return this.data()?.categories.find((c) => c.id === id)?.name ?? '';
  }
  protected accountName(id: string): string {
    return this.data()?.accounts.find((a) => a.id === id)?.name ?? '';
  }

  // --- Règlement d'une prévision
  protected async settle(op: BudgetOperation): Promise<void> {
    const d = this.data();
    if (!d) return;
    const modal = await this.modals.create({
      component: SettleFormComponent,
      componentProps: { operation: op, currency: d.currency, accounts: d.accounts },
    });
    await modal.present();
    const { role, data } = await modal.onWillDismiss<{ operation: BudgetOperation; replayed: boolean }>();
    if (role !== 'saved' || !data) return;
    await this.load();
    const o = data.operation;
    if (data.replayed) await this.say('Ce paiement était déjà enregistré.');
    else if (o.economy > 0) await this.say(`Prévision soldée, économie de ${this.money(o.economy)} !`);
    else if (o.status === 'SOLDEE') await this.say('Prévision soldée, bravo !');
    else await this.say(`Paiement enregistré. Reste ${this.money(o.remaining)}.`);
  }

  protected async menu(op: BudgetOperation): Promise<void> {
    const cancelled = op.status === 'ANNULEE';
    const sheet = await this.sheets.create({
      header: op.label,
      buttons: [
        { text: 'Modifier le montant prévu', data: 'amount' },
        { text: cancelled ? 'Rétablir la prévision' : 'Annuler la prévision', data: 'toggle' },
        { text: 'Supprimer', role: 'destructive', data: 'delete' },
        { text: 'Fermer', role: 'cancel' },
      ],
    });
    await sheet.present();
    const { data } = await sheet.onWillDismiss<string>();
    if (data === 'amount') await this.editPlanned(op);
    if (data === 'toggle')
      await this.run(() => this.api.updateOperation(op.id, { cancelled: !cancelled }).then(() => this.load()));
    if (data === 'delete') await this.removeOperation(op);
  }

  private async editPlanned(op: BudgetOperation): Promise<void> {
    const currency = this.data()?.currency ?? 'XOF';
    const value = await this.askAmount('Montant prévu', op.label, toInputValue(op.plannedAmount, currency));
    if (value === null) return;
    await this.run(() => this.api.updateOperation(op.id, { plannedAmount: value }).then(() => this.load()));
  }

  private async removeOperation(op: BudgetOperation): Promise<void> {
    const alert = await this.alerts.create({
      header: 'Supprimer cette prévision ?',
      message: 'Les paiements déjà enregistrés sont conservés.',
      buttons: [
        { text: 'Garder', role: 'cancel' },
        { text: 'Supprimer', role: 'destructive' },
      ],
    });
    await alert.present();
    if ((await alert.onWillDismiss()).role !== 'destructive') return;
    await this.run(() => this.api.deleteOperation(op.id).then(() => this.load()));
  }

  protected async removeTx(t: BudgetTransaction): Promise<void> {
    const alert = await this.alerts.create({
      header: 'Supprimer cette opération ?',
      message: t.plannedOperationId ? 'La prévision liée sera recalculée.' : 'Le solde du compte sera recalculé.',
      buttons: [
        { text: 'Garder', role: 'cancel' },
        { text: 'Supprimer', role: 'destructive' },
      ],
    });
    await alert.present();
    if ((await alert.onWillDismiss()).role !== 'destructive') return;
    await this.run(() => this.api.deleteTransaction(t.id).then(() => this.load()));
  }

  // --- Enveloppes
  protected async chooseEnvelope(): Promise<void> {
    const d = this.data();
    if (!d) return;
    const taken = new Set(d.envelopes.map((e) => e.categoryId));
    const free = d.categories.filter((c) => c.type !== 'REVENU' && !taken.has(c.id));
    if (free.length === 0) {
      await this.say('Toutes tes catégories ont déjà une enveloppe.');
      return;
    }
    const sheet = await this.sheets.create({
      header: 'Pour quelle catégorie ?',
      buttons: [...free.map((c) => ({ text: c.name, data: c.id })), { text: 'Fermer', role: 'cancel' }],
    });
    await sheet.present();
    const { data } = await sheet.onWillDismiss<string>();
    const category = free.find((c) => c.id === data);
    if (category) await this.setEnvelope(category.id, category.name, '');
  }

  protected async editEnvelope(e: BudgetEnvelope): Promise<void> {
    await this.setEnvelope(
      e.categoryId,
      e.categoryName,
      e.planned > 0 ? toInputValue(e.planned, this.data()?.currency ?? 'XOF') : '',
    );
  }

  private async setEnvelope(categoryId: string, name: string, initial: string): Promise<void> {
    const value = await this.askAmount(
      `Enveloppe ${name}`,
      'Montant prévu pour ce mois (0 pour la retirer)',
      initial,
      true,
    );
    if (value === null) return;
    await this.run(() =>
      this.api.setEnvelope({ month: this.month(), categoryId, plannedAmount: value }).then(() => this.load()),
    );
  }

  /** Demande un montant ; renvoie l'entier dans la plus petite unité, ou `null` si annulé ou invalide. */
  private async askAmount(header: string, message: string, initial: string, allowZero = false): Promise<number | null> {
    const currency = this.data()?.currency ?? 'XOF';
    const alert = await this.alerts.create({
      header,
      message,
      inputs: [
        { name: 'amount', type: 'text', value: initial, placeholder: '0', attributes: { inputmode: 'decimal' } },
      ],
      buttons: [
        { text: 'Fermer', role: 'cancel' },
        { text: 'Enregistrer', role: 'confirm' },
      ],
    });
    await alert.present();
    const { role, data } = await alert.onWillDismiss<{ values: { amount: string } }>();
    if (role !== 'confirm' || !data) return null;
    const minor = parseMoney(data.values.amount, currency);
    if (minor === null || (minor === 0 && !allowZero)) {
      await this.say('Montant invalide : saisis un nombre, par exemple 15000.', true);
      return null;
    }
    return minor;
  }

  // `busy` bloque le double appui ; l'erreur du serveur est affichée telle quelle.
  private async run(action: () => Promise<unknown>): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    try {
      await action();
    } catch (e) {
      await this.say(e instanceof Error ? e.message : 'Action impossible', true);
    } finally {
      this.busy.set(false);
    }
  }

  private async say(message: string, danger = false): Promise<void> {
    const t = await this.toasts.create({
      message,
      duration: 3000,
      position: 'top',
      cssClass: danger ? 'ob-toast ob-toast-danger' : 'ob-toast',
    });
    await t.present();
  }
}
