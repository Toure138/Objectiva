import { Router } from 'express';
import { currentUser } from '../../core/auth.middleware.ts';
import { todayIn } from '../../core/dates.ts';
import { parseInput } from '../../core/errors.ts';
import { idParam } from '../../core/ids.ts';
import {
  createGoalSchema,
  createMilestoneSchema,
  listGoalsQuery,
  updateGoalSchema,
  updateMilestoneSchema,
} from './goals.schemas.ts';
import * as goals from './goals.service.ts';

export const goalsRouter = Router();

goalsRouter.get('/', async (req, res) => {
  const { userId, timezone } = currentUser(req);
  const data = await goals.listGoals(userId, todayIn(timezone), parseInput(listGoalsQuery, req.query));
  res.json({ success: true, data });
});

goalsRouter.post('/', async (req, res) => {
  const { userId, timezone } = currentUser(req);
  const data = await goals.createGoal(userId, todayIn(timezone), parseInput(createGoalSchema, req.body));
  res.status(201).json({ success: true, data });
});

goalsRouter.get('/:id', async (req, res) => {
  const { userId, timezone } = currentUser(req);
  const data = await goals.getGoal(userId, idParam(req.params.id, 'Objectif'), todayIn(timezone));
  res.json({ success: true, data });
});

goalsRouter.patch('/:id', async (req, res) => {
  const { userId, timezone } = currentUser(req);
  const data = await goals.updateGoal(
    userId,
    idParam(req.params.id, 'Objectif'),
    todayIn(timezone),
    parseInput(updateGoalSchema, req.body),
  );
  res.json({ success: true, data });
});

goalsRouter.delete('/:id', async (req, res) => {
  await goals.deleteGoal(currentUser(req).userId, idParam(req.params.id, 'Objectif'));
  res.json({ success: true, message: 'Objectif supprimé' });
});

goalsRouter.post('/:id/milestones', async (req, res) => {
  const data = await goals.createMilestone(
    currentUser(req).userId,
    idParam(req.params.id, 'Objectif'),
    parseInput(createMilestoneSchema, req.body),
  );
  res.status(201).json({ success: true, data });
});

export const milestonesRouter = Router();

milestonesRouter.patch('/:id', async (req, res) => {
  const data = await goals.updateMilestone(
    currentUser(req).userId,
    idParam(req.params.id, 'Jalon'),
    parseInput(updateMilestoneSchema, req.body),
  );
  res.json({ success: true, data });
});

milestonesRouter.delete('/:id', async (req, res) => {
  await goals.deleteMilestone(currentUser(req).userId, idParam(req.params.id, 'Jalon'));
  res.json({ success: true, message: 'Jalon supprimé' });
});
