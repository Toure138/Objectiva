import { Router } from 'express';
import { currentUser } from '../../core/auth.middleware.ts';
import { ctxFor, prismaRepo } from '../../core/repo.prisma.ts';
import { getReview } from '../../../../shared/src/domain/today.ts';
import { eventsSummary } from '../events/events.service.ts';

export const reviewsRouter = Router();

reviewsRouter.get('/', async (req, res) => {
  const { userId, timezone } = currentUser(req);
  const data = await getReview(prismaRepo(userId), ctxFor(timezone), req.query, (from, to) => eventsSummary(userId, timezone, from, to));
  res.json({ success: true, data });
});
