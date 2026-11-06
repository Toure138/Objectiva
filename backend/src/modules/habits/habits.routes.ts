import { Router } from 'express';
import type { Request } from 'express';
import { currentUser } from '../../core/auth.middleware.ts';
import { idParam } from '../../core/ids.ts';
import { ctxFor, prismaRepo } from '../../core/repo.prisma.ts';
import * as habits from '../../../../shared/src/domain/habits.ts';

// Aucune règle ici : les commandes vivent dans shared/src/domain/habits.ts (partagées avec le téléphone).
export const habitsRouter = Router();

function ctx(req: Request) {
  const { userId, timezone } = currentUser(req);
  return { repo: prismaRepo(userId), ctx: ctxFor(timezone) };
}
const habitId = (req: Request) => idParam(req.params['id'], 'Habitude');

habitsRouter.get('/', async (req, res) => {
  const { repo, ctx: c } = ctx(req);
  res.json({ success: true, data: await habits.listHabits(repo, c, req.query) });
});

habitsRouter.post('/', async (req, res) => {
  const { repo, ctx: c } = ctx(req);
  res.status(201).json({ success: true, data: await habits.createHabit(repo, c, req.body) });
});

habitsRouter.get('/:id', async (req, res) => {
  const { repo, ctx: c } = ctx(req);
  res.json({ success: true, data: await habits.getHabit(repo, c, habitId(req)) });
});

habitsRouter.patch('/:id', async (req, res) => {
  const { repo, ctx: c } = ctx(req);
  res.json({ success: true, data: await habits.updateHabit(repo, c, habitId(req), req.body) });
});

habitsRouter.delete('/:id', async (req, res) => {
  const { repo } = ctx(req);
  await habits.deleteHabit(repo, habitId(req));
  res.json({ success: true, message: 'Habitude supprimée' });
});

habitsRouter.post('/:id/check', async (req, res) => {
  const { repo, ctx: c } = ctx(req);
  res.json({ success: true, data: await habits.setHabitDay(repo, c, habitId(req), req.body, true) });
});

habitsRouter.post('/:id/uncheck', async (req, res) => {
  const { repo, ctx: c } = ctx(req);
  res.json({ success: true, data: await habits.setHabitDay(repo, c, habitId(req), req.body, false) });
});

habitsRouter.post('/:id/pause', async (req, res) => {
  const { repo, ctx: c } = ctx(req);
  res.json({ success: true, data: await habits.pauseHabit(repo, c, habitId(req), req.body) });
});

habitsRouter.post('/:id/resume', async (req, res) => {
  const { repo, ctx: c } = ctx(req);
  res.json({ success: true, data: await habits.resumeHabit(repo, c, habitId(req)) });
});

habitsRouter.post('/:id/archive', async (req, res) => {
  const { repo, ctx: c } = ctx(req);
  res.json({ success: true, data: await habits.setHabitStatus(repo, c, habitId(req), 'ARCHIVEE') });
});

habitsRouter.post('/:id/unarchive', async (req, res) => {
  const { repo, ctx: c } = ctx(req);
  res.json({ success: true, data: await habits.setHabitStatus(repo, c, habitId(req), 'ACTIVE') });
});
