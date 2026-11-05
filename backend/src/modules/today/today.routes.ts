import { Router } from 'express';
import { currentUser } from '../../core/auth.middleware.ts';
import { ctxFor, prismaRepo } from '../../core/repo.prisma.ts';
import { getToday } from '../../../../shared/src/domain/today.ts';

export const todayRouter = Router();

todayRouter.get('/', async (req, res) => {
  const { userId, timezone } = currentUser(req);
  const data = await getToday(prismaRepo(userId), ctxFor(timezone), req.query);
  res.json({ success: true, data });
});
