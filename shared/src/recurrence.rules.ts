import { addDays, toDbDate } from './dates';

// Règles des réunions récurrentes (spec 009). Fonctions pures, testées sans base.
// Une série décrit « quels jours » ; chaque occurrence est un rendez-vous ordinaire, créé d'avance.

/** Les occurrences sont créées jusqu'à ce nombre de jours après aujourd'hui. */
export const HORIZON_DAYS = 60;
/** Au plus loin : même en consultant une plage lointaine, on ne crée pas au-delà d'un an. */
export const MAX_HORIZON_DAYS = 366;

/** Jour de la semaine ISO : 1 = lundi … 7 = dimanche. */
export function isoWeekday(date: string): number {
  const d = toDbDate(date).getUTCDay();
  return d === 0 ? 7 : d;
}

export interface SeriesRule {
  weekdays: readonly number[];
  startDate: string;
  until: string | null;
}

/** Dates de la série comprises entre `from` et `to` (inclus), dans l'ordre. */
export function seriesDates(rule: SeriesRule, from: string, to: string): string[] {
  const first = rule.startDate > from ? rule.startDate : from;
  const last = rule.until !== null && rule.until < to ? rule.until : to;
  const days = new Set(rule.weekdays);
  const out: string[] = [];
  for (let d = first; d <= last; d = addDays(d, 1)) {
    if (days.has(isoWeekday(d))) out.push(d);
  }
  return out;
}

/** Première date de la série à partir de `from`, ou `null` si la série est finie avant. */
export function firstDateFrom(rule: SeriesRule, from: string): string | null {
  const start = rule.startDate > from ? rule.startDate : from;
  return seriesDates(rule, start, addDays(start, 6))[0] ?? null;
}

/** Jusqu'où créer les occurrences : 60 jours, ou la fin de la plage consultée, sans dépasser un an. */
export function generationHorizon(today: string, requestedTo?: string): string {
  const base = addDays(today, HORIZON_DAYS);
  const max = addDays(today, MAX_HORIZON_DAYS);
  const wanted = requestedTo !== undefined && requestedTo > base ? requestedTo : base;
  return wanted > max ? max : wanted;
}

/** Hachage non cryptographique sur 128 bits (cyrb128) : mêmes résultats sur tous les moteurs JavaScript. */
function hash128(text: string): [number, number, number, number] {
  let h1 = 1779033703;
  let h2 = 3144134277;
  let h3 = 1013904242;
  let h4 = 2773480762;
  for (let i = 0; i < text.length; i++) {
    const k = text.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= h2 ^ h3 ^ h4;
  h2 ^= h1;
  h3 ^= h1;
  h4 ^= h1;
  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
}

/**
 * Identifiant d'une occurrence, calculé à partir de la série et de la date d'origine : deux appareils
 * hors ligne qui créent la même occurrence lui donnent le même identifiant (pas de doublon à la
 * synchronisation). Hachage de « série/date » au format UUID de version 8 (« personnalisé »).
 */
export function occurrenceId(seriesId: string, date: string): string {
  const hex = hash128(`${seriesId.toLowerCase()}/${date}`)
    .map((n) => n.toString(16).padStart(8, '0'))
    .join('');
  const variant = ((parseInt(hex[16]!, 16) & 0x3) | 0x8).toString(16);
  const h = `${hex.slice(0, 12)}8${hex.slice(13, 16)}${variant}${hex.slice(17)}`;
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
