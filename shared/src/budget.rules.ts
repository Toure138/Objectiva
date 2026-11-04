// Règles de calcul du budget. Fonctions pures : testées sans base de données.
// Tous les montants sont des entiers dans la plus petite unité de la devise.

export type MoneyType = 'REVENU' | 'DEPENSE' | 'EPARGNE';
export type OperationStatus = 'PREVUE' | 'PARTIELLE' | 'SOLDEE' | 'ANNULEE';

export const MAX_AMOUNT = 1_000_000_000;

const MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;

export function isValidMonth(month: string): boolean {
  return MONTH_RE.test(month);
}

/** Premier et dernier jour (AAAA-MM-JJ) d'un mois « AAAA-MM ». */
export function monthBounds(month: string): { from: string; to: string } {
  const m = MONTH_RE.exec(month);
  if (!m) throw new Error('Mois invalide');
  const year = Number(m[1]);
  const mon = Number(m[2]);
  const last = new Date(Date.UTC(year, mon, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, '0')}` };
}

/** « AAAA-MM » d'une date « AAAA-MM-JJ ». */
export function monthOf(date: string): string {
  return date.slice(0, 7);
}

export interface SettlementInput {
  plannedAmount: number;
  /** Total des transactions déjà liées à la prévision. */
  paid: number;
  /** Soldée volontairement (clôturée même si le montant payé est inférieur au prévu). */
  closed: boolean;
  cancelled: boolean;
}

/** Statut d'une prévision : rien payé, partielle, soldée ou annulée. */
export function settlementStatus(i: SettlementInput): OperationStatus {
  if (i.cancelled) return 'ANNULEE';
  if (i.closed || i.paid >= i.plannedAmount) return 'SOLDEE';
  return i.paid > 0 ? 'PARTIELLE' : 'PREVUE';
}

export interface SettlementFigures {
  paid: number;
  /** Reste à régler (0 si soldée ou annulée). */
  remaining: number;
  /** Prévu moins payé, lorsque la prévision a été soldée avec moins que prévu. */
  economy: number;
  /** Payé au-delà du prévu. */
  overrun: number;
}

export function settlementFigures(i: SettlementInput & { status: OperationStatus }): SettlementFigures {
  const settled = i.status === 'SOLDEE' || i.status === 'ANNULEE';
  return {
    paid: i.paid,
    remaining: settled ? 0 : Math.max(0, i.plannedAmount - i.paid),
    economy: i.status === 'SOLDEE' && i.paid < i.plannedAmount ? i.plannedAmount - i.paid : 0,
    overrun: i.status === 'ANNULEE' ? 0 : Math.max(0, i.paid - i.plannedAmount),
  };
}

/** Solde d'un compte : ouverture + revenus − dépenses − épargne (transactions réelles seulement). */
export function accountBalance(opening: number, transactions: { type: MoneyType; amount: number }[]): number {
  return transactions.reduce((sum, t) => (t.type === 'REVENU' ? sum + t.amount : sum - t.amount), opening);
}

export interface MonthOperation {
  type: MoneyType;
  plannedAmount: number;
  status: OperationStatus;
  paid: number;
}

export interface MonthSummary {
  plannedIncome: number;
  plannedExpense: number;
  plannedSaving: number;
  realIncome: number;
  realExpense: number;
  realSaving: number;
  /** Dépenses prévues moins dépenses réelles ; négatif = dépassement. */
  remainingToSpend: number;
  overspent: boolean;
  /** Part des dépenses prévues déjà dépensée ; `null` sans dépense prévue. Peut dépasser 100. */
  expensePercent: number | null;
  /** Somme des économies des prévisions soldées avec moins que prévu. */
  economy: number;
  /** Revenus moins dépenses et épargne, prévus puis réels. */
  plannedNet: number;
  realNet: number;
}

/** Résumé d'un mois : `operations` = prévisions du mois ; `transactions` = opérations réelles du mois. */
export function monthSummary(operations: MonthOperation[], transactions: { type: MoneyType; amount: number }[]): MonthSummary {
  const active = operations.filter((o) => o.status !== 'ANNULEE');
  const planned = (t: MoneyType) => active.filter((o) => o.type === t).reduce((s, o) => s + o.plannedAmount, 0);
  const real = (t: MoneyType) => transactions.filter((x) => x.type === t).reduce((s, x) => s + x.amount, 0);
  const plannedIncome = planned('REVENU');
  const plannedExpense = planned('DEPENSE');
  const plannedSaving = planned('EPARGNE');
  const realIncome = real('REVENU');
  const realExpense = real('DEPENSE');
  const realSaving = real('EPARGNE');
  const economy = active.reduce(
    (s, o) => s + settlementFigures({ plannedAmount: o.plannedAmount, paid: o.paid, closed: o.status === 'SOLDEE', cancelled: false, status: o.status }).economy,
    0,
  );
  return {
    plannedIncome,
    plannedExpense,
    plannedSaving,
    realIncome,
    realExpense,
    realSaving,
    remainingToSpend: plannedExpense - realExpense,
    overspent: realExpense > plannedExpense,
    expensePercent: plannedExpense > 0 ? Math.round((realExpense / plannedExpense) * 100) : null,
    economy,
    plannedNet: plannedIncome - plannedExpense - plannedSaving,
    realNet: realIncome - realExpense - realSaving,
  };
}

export interface EnvelopeFigures {
  planned: number;
  spent: number;
  /** Prévu moins dépensé ; négatif = dépassement. */
  remaining: number;
  /** Part dépensée du prévu ; `null` sans montant prévu (pas de pourcentage sur zéro). */
  percent: number | null;
  overspent: boolean;
}

export function envelopeFigures(planned: number, spent: number): EnvelopeFigures {
  return {
    planned,
    spent,
    remaining: planned - spent,
    percent: planned > 0 ? Math.round((spent / planned) * 100) : null,
    overspent: planned > 0 && spent > planned,
  };
}
