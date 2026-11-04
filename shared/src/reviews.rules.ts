// Calcul du bilan d'une période. Fonctions pures, dates AAAA-MM-JJ.

import { fromDbDate, toDbDate } from './dates';

export type Period = 'day' | 'week' | 'month';

/** Bornes incluses d'une période. La semaine va du lundi au dimanche. */
export function periodRange(period: Period, date: string): { from: string; to: string } {
  const d = toDbDate(date);
  if (period === 'day') return { from: date, to: date };
  if (period === 'week') {
    const dow = (d.getUTCDay() + 6) % 7; // lundi = 0
    const monday = new Date(d.getTime() - dow * 86_400_000);
    const sunday = new Date(monday.getTime() + 6 * 86_400_000);
    return { from: fromDbDate(monday)!, to: fromDbDate(sunday)! };
  }
  const first = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
  return { from: fromDbDate(first)!, to: fromDbDate(last)! };
}

export interface ReviewTask {
  status: 'TODO' | 'DONE' | 'CANCELLED';
  workDate: string | null;
  originalDate: string | null;
  /** Jour de création dans le fuseau de l'utilisateur. */
  createdDate: string;
}

export interface Rate {
  numerator: number;
  denominator: number;
  percent: number;
}

export interface TaskReview {
  /** Tâches attendues sur la période (hors annulées). */
  expected: number;
  done: number;
  pending: number;
  /** Prévues dans la période puis reportées en dehors (ou remises à planifier). */
  rescheduledOut: number;
  /** Annulées : exclues des attendues, mais visibles dans le bilan. */
  cancelled: number;
  plannedAtStart: number;
  addedDuringPeriod: number;
  /** null quand aucune tâche n'était attendue : pas de taux sur une période vide. */
  executionRate: Rate | null;
}

export function reviewTasks(tasks: ReviewTask[], from: string, to: string): TaskReview {
  const inRange = (d: string | null) => d !== null && d >= from && d <= to;
  const concerned = tasks.filter((t) => inRange(t.workDate) || inRange(t.originalDate));
  const cancelled = concerned.filter((t) => t.status === 'CANCELLED');
  const active = concerned.filter((t) => t.status !== 'CANCELLED');

  const done = active.filter((t) => t.status === 'DONE' && inRange(t.workDate)).length;
  const pending = active.filter((t) => t.status === 'TODO' && inRange(t.workDate)).length;
  const rescheduledOut = active.filter((t) => !inRange(t.workDate)).length;
  const expected = active.length;

  return {
    expected,
    done,
    pending,
    rescheduledOut,
    cancelled: cancelled.length,
    plannedAtStart: active.filter((t) => t.createdDate < from).length,
    addedDuringPeriod: active.filter((t) => t.createdDate >= from).length,
    executionRate: expected > 0 ? { numerator: done, denominator: expected, percent: Math.round((done / expected) * 100) } : null,
  };
}
