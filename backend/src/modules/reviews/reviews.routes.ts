import { Router } from 'express';
import { z } from 'zod';
import { currentUser } from '../../core/auth.middleware.ts';
import { dateOnly, daysBetween, todayIn } from '../../core/dates.ts';
import { parseInput } from '../../core/errors.ts';
import { periodRange } from './reviews.rules.ts';
import { getReview } from './reviews.service.ts';

// Soit une période (jour/semaine/mois) autour d'une date, soit des bornes explicites.
const reviewQuery = z
  .object({
    period: z.enum(['day', 'week', 'month']).optional(),
    date: dateOnly.optional(),
    from: dateOnly.optional(),
    to: dateOnly.optional(),
  })
  .refine((q) => q.period || (q.from && q.to), { message: 'Indique une période ou des dates de début et de fin' })
  .refine((q) => !q.from || !q.to || q.from <= q.to, { message: 'La date de début doit précéder la date de fin', path: ['to'] })
  .refine((q) => !q.from || !q.to || daysBetween(q.from, q.to) <= 366, { message: 'Période limitée à un an', path: ['to'] });

export const reviewsRouter = Router();

reviewsRouter.get('/', async (req, res) => {
  const { userId, timezone } = currentUser(req);
  const q = parseInput(reviewQuery, req.query);
  const range = q.period ? periodRange(q.period, q.date ?? todayIn(timezone)) : { from: q.from!, to: q.to! };
  res.json({ success: true, data: await getReview(userId, timezone, range.from, range.to) });
});
