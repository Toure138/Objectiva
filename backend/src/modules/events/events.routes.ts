import { Router } from 'express';
import { currentUser } from '../../core/auth.middleware.ts';
import { todayIn } from '../../core/dates.ts';
import { parseInput } from '../../core/errors.ts';
import { idParam } from '../../core/ids.ts';
import {
  completeEventSchema,
  createEventSchema,
  createEventTaskSchema,
  listEventsQuery,
  updateEventSchema,
} from './events.schemas.ts';
import * as events from './events.service.ts';

export const eventsRouter = Router();

function ctx(req: Parameters<typeof currentUser>[0]) {
  const { userId, timezone } = currentUser(req);
  return { userId, timezone, today: todayIn(timezone), eventId: idParam(req.params.id, 'Événement') };
}

eventsRouter.get('/', async (req, res) => {
  const { userId, timezone } = currentUser(req);
  res.json({ success: true, data: await events.listEvents(userId, timezone, parseInput(listEventsQuery, req.query)) });
});

eventsRouter.post('/', async (req, res) => {
  const { userId, timezone } = currentUser(req);
  const data = await events.createEvent(userId, timezone, parseInput(createEventSchema, req.body));
  res.status(201).json({ success: true, data });
});

eventsRouter.get('/:id', async (req, res) => {
  const { userId, timezone, today, eventId } = ctx(req);
  res.json({ success: true, data: await events.getEvent(userId, eventId, timezone, today) });
});

eventsRouter.patch('/:id', async (req, res) => {
  const { userId, timezone, eventId } = ctx(req);
  const data = await events.updateEvent(userId, eventId, timezone, parseInput(updateEventSchema, req.body));
  res.json({ success: true, data });
});

eventsRouter.delete('/:id', async (req, res) => {
  const { userId, eventId } = ctx(req);
  await events.deleteEvent(userId, eventId);
  res.json({ success: true, message: 'Événement supprimé' });
});

eventsRouter.post('/:id/complete', async (req, res) => {
  const { userId, timezone, eventId } = ctx(req);
  const data = await events.completeEvent(userId, eventId, timezone, parseInput(completeEventSchema, req.body));
  res.json({ success: true, data });
});

eventsRouter.post('/:id/reopen', async (req, res) => {
  const { userId, timezone, eventId } = ctx(req);
  res.json({ success: true, data: await events.reopenEvent(userId, eventId, timezone) });
});

eventsRouter.post('/:id/cancel', async (req, res) => {
  const { userId, timezone, eventId } = ctx(req);
  res.json({ success: true, data: await events.cancelEvent(userId, eventId, timezone) });
});

eventsRouter.post('/:id/tasks', async (req, res) => {
  const { userId, timezone, today, eventId } = ctx(req);
  const data = await events.createEventTask(userId, eventId, timezone, today, parseInput(createEventTaskSchema, req.body));
  res.status(201).json({ success: true, data });
});
