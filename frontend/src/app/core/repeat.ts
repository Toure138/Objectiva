import { isoWeekday } from '../../../../shared/src/recurrence.rules';

import type { EventRepeat } from './models';

/** Jours de la semaine ISO (1 = lundi … 7 = dimanche) : initiale affichée et nom complet (lecteur d'écran). */
export const WEEKDAYS: readonly { day: number; short: string; long: string }[] = [
  { day: 1, short: 'L', long: 'lundi' },
  { day: 2, short: 'M', long: 'mardi' },
  { day: 3, short: 'M', long: 'mercredi' },
  { day: 4, short: 'J', long: 'jeudi' },
  { day: 5, short: 'V', long: 'vendredi' },
  { day: 6, short: 'S', long: 'samedi' },
  { day: 7, short: 'D', long: 'dimanche' },
];

/** Choix proposés dans le formulaire. */
export type RepeatMode = 'none' | 'daily' | 'weekdays' | 'weekly' | 'custom';

export const REPEAT_MODES: readonly [RepeatMode, string][] = [
  ['none', 'Ne se répète pas'],
  ['daily', 'Chaque jour'],
  ['weekdays', 'En semaine (lun.–ven.)'],
  ['weekly', 'Chaque semaine'],
  ['custom', 'Jours choisis'],
];

const ALL = [1, 2, 3, 4, 5, 6, 7];
const WORK = [1, 2, 3, 4, 5];
const same = (a: readonly number[], b: readonly number[]): boolean =>
  a.length === b.length && a.every((d, i) => d === b[i]);

/** Jours envoyés au serveur pour un choix du formulaire. `date` : premier jour (pour « chaque semaine »). */
export function weekdaysFor(mode: RepeatMode, date: string, custom: readonly number[]): number[] {
  switch (mode) {
    case 'daily':
      return ALL;
    case 'weekdays':
      return WORK;
    case 'weekly':
      return [isoWeekday(date)];
    case 'custom':
      return [...custom].sort((a, b) => a - b);
    default:
      return [];
  }
}

/** Choix du formulaire correspondant à une répétition existante. */
export function modeOf(weekdays: readonly number[], date: string): RepeatMode {
  if (same(weekdays, ALL)) return 'daily';
  if (same(weekdays, WORK)) return 'weekdays';
  if (weekdays.length === 1 && weekdays[0] === isoWeekday(date)) return 'weekly';
  return 'custom';
}

const shortDate = (date: string): string =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', timeZone: 'UTC' });

/** « Chaque jour », « En semaine », « Chaque jeudi », « Lun, mer, ven », suivi de « jusqu'au 31 déc. ». */
export function repeatLabel(repeat: EventRepeat): string {
  const days = repeat.weekdays;
  let base: string;
  if (same(days, ALL)) base = 'Chaque jour';
  else if (same(days, WORK)) base = 'En semaine';
  else if (days.length === 1) base = `Chaque ${WEEKDAYS[days[0]! - 1]!.long}`;
  else {
    const names = days.map((d) => WEEKDAYS[d - 1]!.long.slice(0, 3));
    base = names.join(', ');
    base = base.charAt(0).toUpperCase() + base.slice(1);
  }
  return repeat.until ? `${base} jusqu’au ${shortDate(repeat.until)}` : base;
}
