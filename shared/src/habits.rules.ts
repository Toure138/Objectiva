import { addDays } from './dates';
import { isoWeekday } from './recurrence.rules';

// Règles des habitudes (spec 012). Fonctions pures, testées sans base.
// Une habitude porte une liste DATÉE de règles : changer de fréquence n'altère jamais le passé.

export type HabitKind = 'JOURS' | 'SEMAINE';

/** À partir de `from` : jours fixes (`weekdays`, 1 = lundi … 7 = dimanche) ou `timesPerWeek` fois par semaine. */
export interface HabitRule {
  from: string;
  kind: HabitKind;
  weekdays: number[];
  timesPerWeek: number | null;
}

/** Pause du `from` au `to` inclus ; `to` absent : en pause jusqu'à la reprise. */
export interface HabitPause {
  from: string;
  to: string | null;
}

export interface HabitLike {
  startDate: string;
  rules: HabitRule[];
  pauses: HabitPause[];
}

/** Longueur maximale parcourue (environ 10 ans) : garde-fou des boucles. */
const MAX_DAYS = 3660;

/** Règle en vigueur ce jour-là ; `null` avant le début. */
export function ruleOn(h: HabitLike, date: string): HabitRule | null {
  if (date < h.startDate) return null;
  let current: HabitRule | null = null;
  for (const r of h.rules) if (r.from <= date && (!current || r.from >= current.from)) current = r;
  return current;
}

export function isPaused(h: HabitLike, date: string): boolean {
  return h.pauses.some((p) => p.from <= date && (p.to === null || date <= p.to));
}

/** Jour où l'habitude compte : après le début, hors pause. */
export function isActive(h: HabitLike, date: string): boolean {
  return date >= h.startDate && !isPaused(h, date) && ruleOn(h, date) !== null;
}

/** Jour fixe prévu (règle `JOURS`). Une règle `SEMAINE` n'impose aucun jour précis. */
export function isExpected(h: HabitLike, date: string): boolean {
  const rule = ruleOn(h, date);
  return rule?.kind === 'JOURS' && isActive(h, date) && rule.weekdays.includes(isoWeekday(date));
}

/** Lundi de la semaine de `date`. */
export function mondayOf(date: string): string {
  return addDays(date, 1 - isoWeekday(date));
}

const weekDays = (monday: string): string[] => Array.from({ length: 7 }, (_, i) => addDays(monday, i));

/**
 * Objectif d'une semaine « N fois par semaine » : N, réduit au prorata des jours actifs (début en cours de
 * semaine, pause), au moins 1 s'il reste un jour actif. 0 si la semaine ne relève pas d'une règle `SEMAINE`.
 */
export function weekTarget(h: HabitLike, monday: string): number {
  const active = weekDays(monday).filter((d) => isActive(h, d));
  if (active.length === 0) return 0;
  const rule = ruleOn(h, active[0]!);
  if (rule?.kind !== 'SEMAINE' || !rule.timesPerWeek) return 0;
  return Math.max(1, Math.round((rule.timesPerWeek * active.length) / 7));
}

/** Nombre de jours faits dans la semaine (jusqu'à `until` inclus). */
export function weekDone(monday: string, done: ReadonlySet<string>, until: string): number {
  return weekDays(monday).filter((d) => d <= until && done.has(d)).length;
}

/**
 * Série en cours. `JOURS` : jours prévus consécutifs faits, en remontant depuis aujourd'hui (aujourd'hui pas
 * encore fait ne la casse pas). `SEMAINE` : semaines consécutives où l'objectif est atteint (semaine en cours
 * en attente). L'unité suit la règle d'aujourd'hui.
 */
export function currentStreak(h: HabitLike, done: ReadonlySet<string>, today: string): { value: number; unit: 'JOURS' | 'SEMAINES' } {
  const kind = (ruleOn(h, today) ?? h.rules[h.rules.length - 1])?.kind ?? 'JOURS';
  if (kind === 'SEMAINE') {
    let value = 0;
    const thisWeek = mondayOf(today);
    for (let w = thisWeek, i = 0; i < MAX_DAYS / 7 && addDays(w, 6) >= h.startDate; w = addDays(w, -7), i++) {
      const target = weekTarget(h, w);
      if (target === 0) {
        // Semaine entièrement en pause : ignorée ; semaine d'une autre règle : la série s'arrête là.
        if (weekDays(w).some((d) => d >= h.startDate && !isPaused(h, d))) break;
        continue;
      }
      if (weekDone(w, done, today) >= target) value++;
      else if (w !== thisWeek) break;
    }
    return { value, unit: 'SEMAINES' };
  }
  let value = 0;
  for (let d = today, i = 0; i < MAX_DAYS && d >= h.startDate; d = addDays(d, -1), i++) {
    if (!isExpected(h, d)) continue;
    if (done.has(d)) value++;
    else if (d !== today) break;
  }
  return { value, unit: 'JOURS' };
}

/** Meilleure série depuis le début (même unité que la série en cours). */
export function bestStreak(h: HabitLike, done: ReadonlySet<string>, today: string): number {
  const kind = (ruleOn(h, today) ?? h.rules[h.rules.length - 1])?.kind ?? 'JOURS';
  let best = 0;
  let run = 0;
  if (kind === 'SEMAINE') {
    const thisWeek = mondayOf(today);
    for (let w = mondayOf(h.startDate); w <= thisWeek; w = addDays(w, 7)) {
      const target = weekTarget(h, w);
      if (target === 0) continue;
      if (weekDone(w, done, today) >= target) best = Math.max(best, ++run);
      else if (w !== thisWeek) run = 0;
    }
    return best;
  }
  for (let d = h.startDate; d <= today; d = addDays(d, 1)) {
    if (!isExpected(h, d)) continue;
    if (done.has(d)) best = Math.max(best, ++run);
    else if (d !== today) run = 0;
  }
  return best;
}

/**
 * Réussite sur une période (bornée au début de l'habitude et à aujourd'hui) : attendus = jours prévus (`JOURS`)
 * + objectif hebdomadaire au prorata de chaque jour actif (`SEMAINE`) ; faits plafonnés aux attendus.
 */
export function successRate(
  h: HabitLike,
  done: ReadonlySet<string>,
  from: string,
  to: string,
  today: string,
): { expected: number; done: number; rate: number | null } {
  const first = from > h.startDate ? from : h.startDate;
  const last = to < today ? to : today;
  let expected = 0;
  let made = 0;
  for (let d = first; d <= last; d = addDays(d, 1)) {
    const rule = ruleOn(h, d);
    if (!rule || !isActive(h, d)) continue;
    if (rule.kind === 'JOURS') {
      if (!rule.weekdays.includes(isoWeekday(d))) continue;
      expected += 1;
      if (done.has(d)) made += 1;
    } else {
      expected += (rule.timesPerWeek ?? 0) / 7;
      if (done.has(d)) made += 1;
    }
  }
  const total = Math.round(expected);
  const capped = Math.min(made, total);
  return { expected: total, done: capped, rate: total === 0 ? null : Math.round((capped / total) * 100) / 100 };
}

export type HabitDayState = 'FAIT' | 'MANQUE' | 'A_FAIRE' | 'PAUSE' | 'LIBRE' | 'AVANT' | 'FUTUR';

/**
 * Grille des `weeks` dernières semaines (lundi → dimanche, semaine en cours comprise). `MANQUE` : jour fixe
 * passé non fait ; `A_FAIRE` : jour fixe d'aujourd'hui pas encore fait ; `LIBRE` : jour sans obligation.
 */
export function habitGrid(h: HabitLike, done: ReadonlySet<string>, today: string, weeks = 5) {
  const start = addDays(mondayOf(today), -7 * (weeks - 1));
  return Array.from({ length: weeks * 7 }, (_, i) => {
    const date = addDays(start, i);
    let state: HabitDayState;
    if (date > today) state = 'FUTUR';
    else if (date < h.startDate) state = 'AVANT';
    else if (done.has(date)) state = 'FAIT';
    else if (isPaused(h, date)) state = 'PAUSE';
    else if (isExpected(h, date)) state = date === today ? 'A_FAIRE' : 'MANQUE';
    else state = 'LIBRE';
    return { date, state };
  });
}
