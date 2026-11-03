import { describe, expect, it } from 'vitest';
import {
  accountBalance,
  envelopeFigures,
  isValidMonth,
  monthBounds,
  monthOf,
  monthSummary,
  settlementFigures,
  settlementStatus,
} from '../../src/modules/budget/budget.rules.ts';

describe('mois', () => {
  it('valide le format AAAA-MM', () => {
    expect(isValidMonth('2026-11')).toBe(true);
    expect(isValidMonth('2026-13')).toBe(false);
    expect(isValidMonth('2026-00')).toBe(false);
    expect(isValidMonth('2026-1')).toBe(false);
    expect(isValidMonth('26-11')).toBe(false);
  });
  it('donne le premier et le dernier jour, années bissextiles comprises', () => {
    expect(monthBounds('2026-11')).toEqual({ from: '2026-11-01', to: '2026-11-30' });
    expect(monthBounds('2028-02')).toEqual({ from: '2028-02-01', to: '2028-02-29' });
    expect(monthBounds('2027-02').to).toBe('2027-02-28');
    expect(monthBounds('2026-12').to).toBe('2026-12-31');
    expect(monthOf('2026-11-30')).toBe('2026-11');
  });
});

describe('statut d’une prévision', () => {
  const base = { plannedAmount: 15_000, paid: 0, closed: false, cancelled: false };
  it('est prévue tant que rien n’est payé', () => {
    expect(settlementStatus(base)).toBe('PREVUE');
  });
  it('devient partielle puis soldée quand le prévu est atteint', () => {
    expect(settlementStatus({ ...base, paid: 9_000 })).toBe('PARTIELLE');
    expect(settlementStatus({ ...base, paid: 15_000 })).toBe('SOLDEE');
    expect(settlementStatus({ ...base, paid: 16_000 })).toBe('SOLDEE');
  });
  it('est soldée si on la clôt avec moins, annulée si annulée', () => {
    expect(settlementStatus({ ...base, paid: 12_000, closed: true })).toBe('SOLDEE');
    expect(settlementStatus({ ...base, paid: 12_000, closed: true, cancelled: true })).toBe('ANNULEE');
  });
});

describe('chiffres d’une prévision', () => {
  it('calcule le reste d’une prévision partielle', () => {
    expect(settlementFigures({ plannedAmount: 15_000, paid: 9_000, closed: false, cancelled: false, status: 'PARTIELLE' })).toEqual({
      paid: 9_000,
      remaining: 6_000,
      economy: 0,
      overrun: 0,
    });
  });
  it('calcule l’économie d’une prévision soldée avec moins que prévu', () => {
    expect(settlementFigures({ plannedAmount: 15_000, paid: 12_000, closed: true, cancelled: false, status: 'SOLDEE' })).toEqual({
      paid: 12_000,
      remaining: 0,
      economy: 3_000,
      overrun: 0,
    });
  });
  it('signale un dépassement', () => {
    expect(settlementFigures({ plannedAmount: 15_000, paid: 17_500, closed: false, cancelled: false, status: 'SOLDEE' })).toMatchObject({
      remaining: 0,
      economy: 0,
      overrun: 2_500,
    });
  });
  it('ne compte ni reste ni dépassement pour une prévision annulée', () => {
    expect(settlementFigures({ plannedAmount: 15_000, paid: 5_000, closed: false, cancelled: true, status: 'ANNULEE' })).toMatchObject({
      remaining: 0,
      overrun: 0,
    });
  });
});

describe('solde d’un compte', () => {
  it('ajoute les revenus, retire dépenses et épargne', () => {
    expect(
      accountBalance(50_000, [
        { type: 'REVENU', amount: 200_000 },
        { type: 'DEPENSE', amount: 35_000 },
        { type: 'EPARGNE', amount: 20_000 },
      ]),
    ).toBe(195_000);
  });
  it('peut être négatif et reste entier', () => {
    expect(accountBalance(0, [{ type: 'DEPENSE', amount: 1 }])).toBe(-1);
  });
});

describe('résumé du mois', () => {
  const ops = [
    { type: 'REVENU' as const, plannedAmount: 300_000, status: 'PREVUE' as const, paid: 0 },
    { type: 'DEPENSE' as const, plannedAmount: 15_000, status: 'SOLDEE' as const, paid: 12_000 },
    { type: 'DEPENSE' as const, plannedAmount: 40_000, status: 'PARTIELLE' as const, paid: 10_000 },
    { type: 'DEPENSE' as const, plannedAmount: 99_000, status: 'ANNULEE' as const, paid: 0 },
    { type: 'EPARGNE' as const, plannedAmount: 20_000, status: 'PREVUE' as const, paid: 0 },
  ];
  const txs = [
    { type: 'DEPENSE' as const, amount: 12_000 },
    { type: 'DEPENSE' as const, amount: 10_000 },
    { type: 'DEPENSE' as const, amount: 4_000 },
    { type: 'REVENU' as const, amount: 100_000 },
  ];
  it('additionne le prévu (hors annulé) et le réel, et calcule reste, économie et net', () => {
    expect(monthSummary(ops, txs)).toEqual({
      plannedIncome: 300_000,
      plannedExpense: 55_000,
      plannedSaving: 20_000,
      realIncome: 100_000,
      realExpense: 26_000,
      realSaving: 0,
      remainingToSpend: 29_000,
      overspent: false,
      expensePercent: 47,
      economy: 3_000,
      plannedNet: 225_000,
      realNet: 74_000,
    });
  });
  it('signale un dépassement', () => {
    const s = monthSummary([{ type: 'DEPENSE', plannedAmount: 10_000, status: 'PREVUE', paid: 0 }], [{ type: 'DEPENSE', amount: 12_500 }]);
    expect(s).toMatchObject({ remainingToSpend: -2_500, overspent: true, expensePercent: 125 });
  });
  it('est nul pour un mois vide', () => {
    expect(monthSummary([], [])).toMatchObject({ plannedExpense: 0, remainingToSpend: 0, overspent: false, expensePercent: null, economy: 0 });
  });
});

describe('enveloppe', () => {
  it('compare dépensé et prévu', () => {
    expect(envelopeFigures(50_000, 20_000)).toEqual({ planned: 50_000, spent: 20_000, remaining: 30_000, percent: 40, overspent: false });
    expect(envelopeFigures(50_000, 60_000)).toMatchObject({ remaining: -10_000, percent: 120, overspent: true });
  });
  it('n’invente pas de pourcentage sans montant prévu', () => {
    expect(envelopeFigures(0, 5_000)).toMatchObject({ percent: null, overspent: false, remaining: -5_000 });
  });
});
