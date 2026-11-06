import type { Habit, HabitDayState, HabitStreak } from './models';
import { repeatLabel } from './repeat';

/** « Chaque jour », « En semaine », « Lun, mer, ven », « 3 fois par semaine ». */
export function frequencyLabel(h: Pick<Habit, 'kind' | 'weekdays' | 'timesPerWeek' | 'startDate'>): string {
  if (h.kind === 'SEMAINE') return `${h.timesPerWeek} fois par semaine`;
  return repeatLabel({ weekdays: h.weekdays, startDate: h.startDate, until: null });
}

/** « 5 jours », « 1 semaine », « Pas encore de série ». */
export function streakLabel(s: HabitStreak): string {
  if (s.value === 0) return 'Pas encore de série';
  const unit = s.unit === 'SEMAINES' ? (s.value > 1 ? 'semaines' : 'semaine') : s.value > 1 ? 'jours' : 'jour';
  return `${s.value} ${unit}`;
}

/** Libellé d'une case de la grille, pour le lecteur d'écran. */
export const HABIT_DAY_LABELS: Record<HabitDayState, string> = {
  FAIT: 'fait',
  MANQUE: 'manqué',
  A_FAIRE: 'à faire aujourd’hui',
  PAUSE: 'en pause',
  LIBRE: 'pas prévu',
  AVANT: 'avant le début',
  FUTUR: 'à venir',
};
