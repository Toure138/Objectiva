import { Router } from 'express';
import { currentUser } from '../../core/auth.middleware.ts';
import { todayIn } from '../../core/dates.ts';
import { parseInput } from '../../core/errors.ts';
import { idParam } from '../../core/ids.ts';
import { createTaskSchema, listTasksQuery, rescheduleSchema, updateTaskSchema } from './tasks.schemas.ts';
import * as tasks from './tasks.service.ts';

export const tasksRouter = Router();

function ctx(req: Parameters<typeof currentUser>[0]) {
  const { userId, timezone } = currentUser(req);
  return { userId, today: todayIn(timezone), taskId: idParam(req.params.id, 'Tâche') };
}

tasksRouter.get('/', async (req, res) => {
  const { userId, timezone } = currentUser(req);
  const data = await tasks.listTasks(userId, todayIn(timezone), parseInput(listTasksQuery, req.query));
  res.json({ success: true, data });
});

tasksRouter.post('/', async (req, res) => {
  const { userId, timezone } = currentUser(req);
  const data = await tasks.createTask(userId, todayIn(timezone), parseInput(createTaskSchema, req.body));
  res.status(201).json({ success: true, data });
});

tasksRouter.get('/:id', async (req, res) => {
  const { userId, today, taskId } = ctx(req);
  res.json({ success: true, data: await tasks.getTask(userId, taskId, today) });
});

tasksRouter.patch('/:id', async (req, res) => {
  const { userId, today, taskId } = ctx(req);
  const data = await tasks.updateTask(userId, taskId, today, parseInput(updateTaskSchema, req.body));
  res.json({ success: true, data });
});

tasksRouter.delete('/:id', async (req, res) => {
  const { userId, taskId } = ctx(req);
  await tasks.deleteTask(userId, taskId);
  res.json({ success: true, message: 'Tâche supprimée' });
});

tasksRouter.post('/:id/complete', async (req, res) => {
  const { userId, today, taskId } = ctx(req);
  res.json({ success: true, data: await tasks.completeTask(userId, taskId, today) });
});

tasksRouter.post('/:id/reopen', async (req, res) => {
  const { userId, today, taskId } = ctx(req);
  res.json({ success: true, data: await tasks.reopenTask(userId, taskId, today) });
});

tasksRouter.post('/:id/reschedule', async (req, res) => {
  const { userId, today, taskId } = ctx(req);
  const data = await tasks.rescheduleTask(userId, taskId, today, parseInput(rescheduleSchema, req.body));
  res.json({ success: true, data });
});

tasksRouter.post('/:id/cancel', async (req, res) => {
  const { userId, today, taskId } = ctx(req);
  res.json({ success: true, data: await tasks.cancelTask(userId, taskId, today) });
});
