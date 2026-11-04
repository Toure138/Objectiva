import { z } from 'zod';

// Les dates de calendrier (sans heure) circulent en `YYYY-MM-DD` et sont stockées en DATE.
// Prisma les représente par un Date à minuit UTC : on ne les convertit jamais vers un fuseau,
// sinon « vendredi » deviendrait « jeudi » pour un utilisateur à l'ouest de UTC.

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const dateOnly = z
  .string()
  .regex(DATE_RE, 'Format attendu : AAAA-MM-JJ')
  .refine((s) => {
    const d = new Date(`${s}T00:00:00.000Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
  }, 'Date inexistante');

export function toDbDate(s: string): Date {
  return new Date(`${s}T00:00:00.000Z`);
}

export function fromDbDate(d: Date | null | undefined): string | null {
  return d ? d.toISOString().slice(0, 10) : null;
}

export function todayIn(timezone: string, now = new Date()): string {
  // en-CA produit directement le format AAAA-MM-JJ.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

export function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('fr-FR', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function daysBetween(from: string, to: string): number {
  return Math.round((toDbDate(to).getTime() - toDbDate(from).getTime()) / 86_400_000);
}

/** Jour (AAAA-MM-JJ) décalé de `days` jours, sans conversion de fuseau. */
export function addDays(date: string, days: number): string {
  const d = toDbDate(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Mois « AAAA-MM » décalé de `n` mois (négatif pour reculer). */
export function addMonths(month: string, n: number): string {
  const [y, m] = month.split('-').map(Number) as [number, number];
  return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7);
}
