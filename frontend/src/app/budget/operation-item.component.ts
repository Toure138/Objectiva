import { Component, computed, input, output } from '@angular/core';
import { IonButton, IonIcon } from '@ionic/angular';
import {
  arrowDownCircleOutline,
  arrowUpCircleOutline,
  calendarOutline,
  checkmarkCircle,
  closeCircleOutline,
  ellipsisHorizontal,
  hourglassOutline,
  leafOutline,
  trendingUpOutline,
  warningOutline,
} from 'ionicons/icons';

import { shortDate } from '../core/dates';
import { MONEY_TYPE_LABELS, OPERATION_STATUS_LABELS, type BudgetOperation, type OperationStatus } from '../core/models';
import { formatMoney } from '../core/money';

const STATUS_VISUALS: Record<OperationStatus, { icon: string; cls: string }> = {
  PREVUE: { icon: calendarOutline, cls: '' },
  PARTIELLE: { icon: hourglassOutline, cls: 'ob-chip--warn' },
  SOLDEE: { icon: checkmarkCircle, cls: 'ob-chip--ok' },
  ANNULEE: { icon: closeCircleOutline, cls: '' },
};

/** Carte d'une prévision : libellé, échéance, montant prévu, statut (libellé + icône) et « Régler ». Les chiffres viennent de l'API. */
@Component({
  selector: 'app-operation-item',
  imports: [IonButton, IonIcon],
  styles: `
    :host {
      display: block;
    }
    .op {
      margin-bottom: 8px;
      padding: 14px 8px 10px 16px;
    }
    .op.off {
      background: color-mix(in srgb, var(--ob-surface) 60%, transparent);
      box-shadow: none;
    }
    .head {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 12px;
      padding-right: 8px;
    }
    .title {
      margin: 0;
      font-weight: 600;
      line-height: 1.3;
      overflow-wrap: anywhere;
    }
    .off .title {
      color: var(--ob-text-2);
      text-decoration: line-through;
    }
    .sub {
      margin: 2px 0 0;
      color: var(--ob-text-2);
      font-size: 0.8125rem;
    }
    .amount {
      flex: none;
      margin: 0;
      font-family: var(--ob-font-display);
      font-size: 1.0625rem;
      font-weight: 650;
      font-variant-numeric: tabular-nums;
    }
    .meta {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-top: 10px;
    }
    .actions {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      margin-top: 8px;
    }
    .more.inline {
      margin: -10px -2px -10px auto;
    }
    .more {
      --padding-start: 0;
      --padding-end: 0;
      width: 44px;
      height: 44px;
      color: var(--ob-text-2);
    }
  `,
  template: `
    @let o = op();
    <article [class]="cls()" [style.--i]="index()">
      <div class="head">
        <div>
          <p class="title">{{ o.label }}</p>
          <p class="sub">
            {{ date() }}
            @if (categoryName()) {
              · {{ categoryName() }}
            }
          </p>
        </div>
        <p class="amount">{{ money(o.plannedAmount) }}</p>
      </div>
      <div class="meta">
        <span class="ob-chip"><ion-icon [icon]="typeIcon()" aria-hidden="true"></ion-icon>{{ typeLabel() }}</span>
        <span class="ob-chip" [class]="statusCls()"
          ><ion-icon [icon]="statusIcon()" aria-hidden="true"></ion-icon>{{ statusLabel() }}</span
        >
        @if (o.status === 'PARTIELLE') {
          <span class="ob-chip">Payé {{ money(o.paid) }} · reste {{ money(o.remaining) }}</span>
        }
        @if (o.economy > 0) {
          <span class="ob-chip ob-chip--ok"
            ><ion-icon [icon]="icons.economy" aria-hidden="true"></ion-icon>Économie {{ money(o.economy) }}</span
          >
        }
        @if (o.overrun > 0) {
          <span class="ob-chip ob-chip--danger"
            ><ion-icon [icon]="icons.overrun" aria-hidden="true"></ion-icon>Dépassement {{ money(o.overrun) }}</span
          >
        }
        @if (o.status === 'SOLDEE' || o.status === 'ANNULEE') {
          <ion-button
            class="more inline"
            fill="clear"
            (click)="menu.emit()"
            [attr.aria-label]="'Autres actions : ' + o.label"
          >
            <ion-icon slot="icon-only" [icon]="icons.more"></ion-icon>
          </ion-button>
        }
      </div>
      @if (o.status === 'PREVUE' || o.status === 'PARTIELLE') {
        <div class="actions">
          <ion-button class="ob-soft" size="small" (click)="settle.emit()" [attr.aria-label]="'Régler : ' + o.label"
            >Régler</ion-button
          >
          <ion-button class="more" fill="clear" (click)="menu.emit()" [attr.aria-label]="'Autres actions : ' + o.label">
            <ion-icon slot="icon-only" [icon]="icons.more"></ion-icon>
          </ion-button>
        </div>
      }
    </article>
  `,
})
export class OperationItemComponent {
  readonly op = input.required<BudgetOperation>();
  readonly currency = input.required<string>();
  readonly categoryName = input('');
  readonly index = input(0);
  readonly settle = output<void>();
  readonly menu = output<void>();

  protected readonly icons = { more: ellipsisHorizontal, economy: leafOutline, overrun: warningOutline };
  protected readonly date = computed(() => shortDate(this.op().dueDate));
  protected readonly typeLabel = computed(() => MONEY_TYPE_LABELS[this.op().type]);
  protected readonly typeIcon = computed(() =>
    this.op().type === 'REVENU'
      ? arrowDownCircleOutline
      : this.op().type === 'EPARGNE'
        ? trendingUpOutline
        : arrowUpCircleOutline,
  );
  protected readonly statusLabel = computed(() => OPERATION_STATUS_LABELS[this.op().status]);
  protected readonly statusIcon = computed(() => STATUS_VISUALS[this.op().status].icon);
  protected readonly statusCls = computed(() => STATUS_VISUALS[this.op().status].cls);
  protected readonly cls = computed(() => `op ob-card ob-rise ${this.op().status === 'ANNULEE' ? 'off' : ''}`);

  protected money(minor: number): string {
    return formatMoney(minor, this.currency());
  }
}
