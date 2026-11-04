import { Router } from 'express';
import type { Request } from 'express';
import { currentUser } from '../../core/auth.middleware.ts';
import { idParam } from '../../core/ids.ts';
import { ctxFor, prismaRepo } from '../../core/repo.prisma.ts';
import * as tasks from '../../../../shared/src/domain/tasks.ts';

// Aucune règle ici : les commandes vivent dans shared/src/domain (partagées avec le téléphone).
export const tasksRouter = Router();

function ctx(req: Request) {
  const { userId, timezone } = currentUser(req);
  return { repo: prismaRepo(userId), ctx: ctxFor(timezone) };
}

tasksRouter.get('/', async (req, res) => {
  const { repo, ctx: c } = ctx(req);
  res.json({ success: true, data: await tasks.listTasks(repo, c, req.query) });
});

tasksRouter.post('/', async (req, res) => {
  const { repo, ctx: c } = ctx(req);
  res.status(201).json({ success: true, data: await tasks.createTask(repo, c, req.body) });
});

tasksRouter.get('/:id', async (req, res) => {
  const { repo, ctx: c } = ctx(req);
  res.json({ success: true, data: await tasks.getTask(repo, c, idParam(req.params.id, 'Tâche')) });
});

tasksRouter.patch('/:id', async (req, res) => {
  const { repo, ctx: c } = ctx(req);
  res.json({ success: true, data: await tasks.updateTask(repo, c, idParam(req.params.id, 'Tâche'), req.body) });
});

tasksRouter.delete('/:id', async (req, res) => {
  await tasks.deleteTask(ctx(req).repo, idParam(req.params.id, 'Tâche'));
  res.json({ success: true, message: 'Tâche supprimée' });
});

tasksRouter.post('/:id/complete', async (req, res) => {
  const { repo, ctx: c } = ctx(req);
  res.json({ success: true, data: await tasks.completeTask(repo, c, idParam(req.params.id, 'Tâche')) });
});

tasksRouter.post('/:id/reopen', async (req, res) => {
  const { repo, ctx: c } = ctx(req);
  res.json({ success: true, data: await tasks.reopenTask(repo, c, idParam(req.params.id, 'Tâche')) });
});

tasksRouter.post('/:id/reschedule', async (req, res) => {
  const { repo, ctx: c } = ctx(req);
  res.json({ success: true, data: await tasks.rescheduleTask(repo, c, idParam(req.params.id, 'Tâche'), req.body) });
});

tasksRouter.post('/:id/cancel', async (req, res) => {
  const { repo, ctx: c } = ctx(req);
  res.json({ success: true, data: await tasks.cancelTask(repo, c, idParam(req.params.id, 'Tâche')) });
});
