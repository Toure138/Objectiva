import { describe, expect, it } from 'vitest';
import {
  bestStreak,
  currentStreak,
  habitGrid,
  isExpected,
  ruleOn,
  successRate,
  weekTarget,
  type HabitLike,
} from '../../../shared/src/habits.rules.ts';

// Spec 012 : séries, réussite et grille des habitudes. Novembre 2026 : le lundi 2, aujourd'hui mercredi 11.

const TODAY = '2026-11-11';
const ALL = [1, 2, 3, 4, 5, 6, 7];
const daily = (over: Partial<HabitLike> = {}): HabitLike => ({
  startDate: '2026-11-02',
  rules: [{ from: '2026-11-02', kind: 'JOURS', weekdays: ALL, timesPerWeek: null }],
  pauses: [],
  ...over,
});
const weekly = (times: number, startDate = '2026-11-02'): HabitLike => ({
  startDate,
  rules: [{ from: startDate, kind: 'SEMAINE', weekdays: [], timesPerWeek: times }],
  pauses: [],
});
const set = (...days: number[]) => new Set(days.map((d) => `2026-11-${String(d).padStart(2, '0')}`));

describe('habitudes : règle et jours prévus', () => {
  it('la règle en vigueur suit sa date ; rien avant le début', () => {
    const h = daily({
      rules: [
        { from: '2026-11-02', kind: 'JOURS', weekdays: ALL, timesPerWeek: null },
        { from: '2026-11-09', kind: 'JOURS', weekdays: [1], timesPerWeek: null },
      ],
    });
    expect(ruleOn(h, '2026-11-01')).toBeNull();
    expect(ruleOn(h, '2026-11-08')!.weekdays).toEqual(ALL);
    expect(ruleOn(h, '2026-11-10')!.weekdays).toEqual([1]);
    expect(isExpected(h, '2026-11-07')).toBe(true); // samedi, ancienne règle
    expect(isExpected(h, '2026-11-10')).toBe(false); // mardi, nouvelle règle
  });
});

describe('habitudes : séries en jours', () => {
  it('aujourd’hui pas encore fait ne casse pas la série ; un jour manqué la casse', () => {
    expect(currentStreak(daily(), set(8, 9, 10), TODAY)).toEqual({ value: 3, unit: 'JOURS' });
    expect(currentStreak(daily(), set(8, 9, 10, 11), TODAY).value).toBe(4);
    expect(currentStreak(daily(), set(7, 9, 10), TODAY).value).toBe(2);
  });

  it('les jours non prévus (week-end) et en pause sont ignorés', () => {
    const work = daily({ rules: [{ from: '2026-11-02', kind: 'JOURS', weekdays: [1, 2, 3, 4, 5], timesPerWeek: null }] });
    // Jeudi 5, vendredi 6, lundi 9, mardi 10 faits : samedi et dimanche ne comptent pas.
    expect(currentStreak(work, set(5, 6, 9, 10), TODAY).value).toBe(4);
    const paused = daily({ pauses: [{ from: '2026-11-07', to: '2026-11-09' }] });
    expect(currentStreak(paused, set(5, 6, 10), TODAY).value).toBe(3);
  });

  it('meilleure série sur tout l’historique', () => {
    expect(bestStreak(daily(), set(2, 3, 4, 5, 7, 8), TODAY)).toBe(4);
  });
});

describe('habitudes : séries en semaines (« N fois par semaine »)', () => {
  it('semaines consécutives atteintes ; la semaine en cours reste en attente', () => {
    const h = weekly(3, '2026-10-26');
    const done = new Set(['2026-10-27', '2026-10-29', '2026-10-30', '2026-11-02', '2026-11-04', '2026-11-06', '2026-11-10']);
    expect(currentStreak(h, done, TODAY)).toEqual({ value: 2, unit: 'SEMAINES' });
    done.add('2026-11-11');
    done.add('2026-11-09');
    expect(currentStreak(h, done, TODAY).value).toBe(3);
  });

  it('objectif réduit au prorata quand on commence en cours de semaine', () => {
    // Début le vendredi 6 : 3 jours actifs sur 7 → 3 × 3/7 ≈ 1.
    expect(weekTarget(weekly(3, '2026-11-06'), '2026-11-02')).toBe(1);
    expect(weekTarget(weekly(3), '2026-11-02')).toBe(3);
  });
});

describe('habitudes : réussite', () => {
  it('jours fixes : faits sur prévus, plafonnés ; aucun jour attendu → pas de taux', () => {
    expect(successRate(daily(), set(2, 3, 4, 9), '2026-11-02', '2026-11-11', TODAY)).toEqual({ expected: 10, done: 4, rate: 0.4 });
    expect(successRate(daily(), set(), '2026-10-01', '2026-10-31', TODAY)).toEqual({ expected: 0, done: 0, rate: null });
    // La période future n'est pas attendue.
    expect(successRate(daily(), set(10, 11), '2026-11-10', '2026-11-30', TODAY).expected).toBe(2);
  });

  it('« N fois par semaine » : objectif au prorata des jours, faits plafonnés', () => {
    // Du lundi 2 au dimanche 8 : 3 attendus ; 5 faits → plafonnés à 3.
    expect(successRate(weekly(3), set(2, 3, 4, 5, 6), '2026-11-02', '2026-11-08', TODAY)).toEqual({ expected: 3, done: 3, rate: 1 });
  });
});

describe('habitudes : grille', () => {
  it('fait, manqué, à faire, pause, libre, avant le début, futur', () => {
    const h = daily({
      rules: [{ from: '2026-11-02', kind: 'JOURS', weekdays: [1, 2, 3, 4, 5], timesPerWeek: null }],
      pauses: [{ from: '2026-11-05', to: '2026-11-05' }],
    });
    const grid = habitGrid(h, set(2, 3), TODAY, 2);
    const state = (day: number) => grid.find((c) => c.date === `2026-11-${String(day).padStart(2, '0')}`)!.state;
    expect(grid).toHaveLength(14);
    expect(grid[0]!.date).toBe('2026-11-02');
    expect([state(2), state(4), state(5), state(7), state(11), state(12)]).toEqual(['FAIT', 'MANQUE', 'PAUSE', 'LIBRE', 'A_FAIRE', 'FUTUR']);
    expect(habitGrid(daily({ startDate: '2026-11-10' }), set(), TODAY, 2)[0]!.state).toBe('AVANT');
  });
});
