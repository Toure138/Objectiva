import { Router } from 'express';
import { currentUser } from '../../core/auth.middleware.ts';
import { ctxFor, prismaRepo } from '../../core/repo.prisma.ts';
import { getToday } from '../../../../shared/src/domain/today.ts';
import { eventsOfDay } from '../events/events.service.ts';

export const todayRouter = Router();

todayRouter.get('/', async (req, res) => {
  const { userId, timezone } = currentUser(req);
  // Les rendez-vous du jour sont lus en base (pas encore dans l'interface de stockage partagée).
  const data = await getToday(prismaRepo(userId), ctxFor(timezone), req.query, (date) => eventsOfDay(userId, timezone, date));
  res.json({ success: true, data });
});
