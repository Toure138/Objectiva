import { z } from 'zod';
import { dateOnly, daysBetween } from './dates';

// Soit une période (jour/semaine/mois) autour d'une date, soit des bornes explicites.
export const reviewQuery = z
  .object({
    period: z.enum(['day', 'week', 'month']).optional(),
    date: dateOnly.optional(),
    from: dateOnly.optional(),
    to: dateOnly.optional(),
  })
  .refine((q) => q.period || (q.from && q.to), { message: 'Indique une période ou des dates de début et de fin' })
  .refine((q) => !q.from || !q.to || q.from <= q.to, { message: 'La date de début doit précéder la date de fin', path: ['to'] })
  .refine((q) => !q.from || !q.to || daysBetween(q.from, q.to) <= 366, { message: 'Période limitée à un an', path: ['to'] });

export const todayQuery = z.object({ date: dateOnly.optional() });
