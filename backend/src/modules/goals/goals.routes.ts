import { Router } from 'express';
import type { Request } from 'express';
import { currentUser } from '../../core/auth.middleware.ts';
import { idParam } from '../../core/ids.ts';
import { ctxFor, prismaRepo } from '../../core/repo.prisma.ts';
import * as goals from '../../../../shared/src/domain/goals.ts';

// Aucune règle ici : les commandes vivent dans shared/src/domain (partagées avec le téléphone).
function ctx(req: Request) {
  const { userId, timezone } = currentUser(req);
  return { repo: prismaRepo(userId), ctx: ctxFor(timezone) };
}

export const goalsRouter = Router();

goalsRouter.get('/', async (req, res) => {
  const { repo, ctx: c } = ctx(req);
  res.json({ success: true, data: await goals.listGoals(repo, c, req.query) });
});

goalsRouter.post('/', async (req, res) => {
  const { repo, ctx: c } = ctx(req);
  res.status(201).json({ success: true, data: await goals.createGoal(repo, c, req.body) });
});

goalsRouter.get('/:id', async (req, res) => {
  const { repo, ctx: c } = ctx(req);
  res.json({ success: true, data: await goals.getGoal(repo, c, idParam(req.params.id, 'Objectif')) });
});

goalsRouter.patch('/:id', async (req, res) => {
  const { repo, ctx: c } = ctx(req);
  res.json({ success: true, data: await goals.updateGoal(repo, c, idParam(req.params.id, 'Objectif'), req.body) });
});

goalsRouter.delete('/:id', async (req, res) => {
  await goals.deleteGoal(ctx(req).repo, idParam(req.params.id, 'Objectif'));
  res.json({ success: true, message: 'Objectif supprimé' });
});

goalsRouter.post('/:id/milestones', async (req, res) => {
  const { repo, ctx: c } = ctx(req);
  res.status(201).json({ success: true, data: await goals.createMilestone(repo, c, idParam(req.params.id, 'Objectif'), req.body) });
});

goalsRouter.post('/:id/readings', async (req, res) => {
  const { repo, ctx: c } = ctx(req);
  res.status(201).json({ success: true, data: await goals.createReading(repo, c, idParam(req.params.id, 'Objectif'), req.body) });
});

export const readingsRouter = Router();

readingsRouter.delete('/:id', async (req, res) => {
  const { repo, ctx: c } = ctx(req);
  res.json({ success: true, data: await goals.deleteReading(repo, c, idParam(req.params.id, 'Relevé')) });
});

export const milestonesRouter = Router();

milestonesRouter.patch('/:id', async (req, res) => {
  const { repo, ctx: c } = ctx(req);
  res.json({ success: true, data: await goals.updateMilestone(repo, c, idParam(req.params.id, 'Jalon'), req.body) });
});

milestonesRouter.delete('/:id', async (req, res) => {
  await goals.deleteMilestone(ctx(req).repo, idParam(req.params.id, 'Jalon'));
  res.json({ success: true, message: 'Jalon supprimé' });
});
