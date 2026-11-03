import { Router } from 'express';
import { z } from 'zod';
import { currentUser } from '../../core/auth.middleware.ts';
import { dateOnly, todayIn } from '../../core/dates.ts';
import { parseInput } from '../../core/errors.ts';
import { getToday } from './today.service.ts';

const todayQuery = z.object({ date: dateOnly.optional() });

export const todayRouter = Router();

todayRouter.get('/', async (req, res) => {
  const { userId, timezone } = currentUser(req);
  const { date } = parseInput(todayQuery, req.query);
  res.json({ success: true, data: await getToday(userId, timezone, date ?? todayIn(timezone)) });
});
