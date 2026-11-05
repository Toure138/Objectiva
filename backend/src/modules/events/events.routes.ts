import { Router } from 'express';
import type { Request } from 'express';
import { currentUser } from '../../core/auth.middleware.ts';
import { idParam } from '../../core/ids.ts';
import { ctxFor, prismaRepo } from '../../core/repo.prisma.ts';
import * as events from '../../../../shared/src/domain/events.ts';
import * as overview from '../../../../shared/src/domain/overview.ts';

// Aucune règle ici : les commandes vivent dans shared/src/domain/events.ts (partagées avec le téléphone).
export const eventsRouter = Router();
export const agendaRouter = Router();
export const calendarRouter = Router();
export const seriesRouter = Router();

function ctx(req: Request) {
  const { userId, timezone } = currentUser(req);
  return { repo: prismaRepo(userId), ctx: ctxFor(timezone) };
}
const eventId = (req: Request) => idParam(req.params['id'], 'Événement');

eventsRouter.get('/', async (req, res) => {
  const { repo, ctx: c } = ctx(req);
  res.json({ success: true, data: await events.listEvents(repo, c, req.query) });
});

eventsRouter.post('/', async (req, res) => {
  const { repo, ctx: c } = ctx(req);
  res.status(201).json({ success: true, data: await events.createEvent(repo, c, req.body) });
});

eventsRouter.get('/:id', async (req, res) => {
  const { repo, ctx: c } = ctx(req);
  res.json({ success: true, data: await events.getEvent(repo, c, eventId(req)) });
});

eventsRouter.patch('/:id', async (req, res) => {
  const { repo, ctx: c } = ctx(req);
  res.json({ success: true, data: await events.updateEvent(repo, c, eventId(req), req.body, req.query) });
});

eventsRouter.delete('/:id', async (req, res) => {
  const { repo, ctx: c } = ctx(req);
  res.json({ success: true, message: await events.deleteEvent(repo, c, eventId(req), req.query) });
});

eventsRouter.post('/:id/complete', async (req, res) => {
  const { repo, ctx: c } = ctx(req);
  res.json({ success: true, data: await events.completeEvent(repo, c, eventId(req), req.body) });
});

eventsRouter.post('/:id/reopen', async (req, res) => {
  const { repo, ctx: c } = ctx(req);
  res.json({ success: true, data: await events.reopenEvent(repo, c, eventId(req)) });
});

eventsRouter.post('/:id/cancel', async (req, res) => {
  const { repo, ctx: c } = ctx(req);
  res.json({ success: true, data: await events.cancelEvent(repo, c, eventId(req)) });
});

eventsRouter.post('/:id/tasks', async (req, res) => {
  const { repo, ctx: c } = ctx(req);
  res.status(201).json({ success: true, data: await events.createEventTask(repo, c, eventId(req), req.body) });
});

agendaRouter.get('/', async (req, res) => {
  const { repo, ctx: c } = ctx(req);
  res.json({ success: true, data: await events.getAgenda(repo, c, req.query) });
});

calendarRouter.get('/', async (req, res) => {
  const { repo, ctx: c } = ctx(req);
  res.json({ success: true, data: await overview.getCalendarMonth(repo, c, req.query) });
});

seriesRouter.get('/', async (req, res) => {
  const { repo, ctx: c } = ctx(req);
  res.json({ success: true, data: await overview.listSeries(repo, c) });
});
