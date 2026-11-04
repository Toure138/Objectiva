import { z } from 'zod';
import { toDbDate } from '../../core/dates.ts';
import { AppError, notFound } from '../../core/errors.ts';
import { prisma } from '../../core/prisma.ts';
import type { Event, Prisma } from '../../generated/prisma/client.ts';
import { resolveLinks, serializeTask } from '../tasks/tasks.service.ts';
import { blockedWindow, defaultTaskDate, localDaysToUtc, localToUtc, utcToLocal } from './events.rules.ts';
import type {
  completeEventSchema,
  createEventSchema,
  createEventTaskSchema,
  listEventsQuery,
  updateEventSchema,
} from './events.schemas.ts';

export function serializeEvent(e: Event, timezone: string) {
  const start = utcToLocal(e.startsAt, timezone);
  const end = utcToLocal(e.endsAt, timezone);
  const blocked = blockedWindow(e.startsAt, e.travelBeforeMinutes, e.prepBeforeMinutes, timezone);
  return {
    id: e.id,
    type: e.type,
    title: e.title,
    date: start.date,
    startTime: start.time,
    endTime: end.time,
    startsAt: e.startsAt.toISOString(),
    endsAt: e.endsAt.toISOString(),
    location: e.location,
    link: e.link,
    participants: e.participants,
    agenda: e.agenda,
    decisions: e.decisions,
    status: e.status,
    goalId: e.goalId,
    milestoneId: e.milestoneId,
    // Temps réservé avant le rendez-vous : déplacement puis préparation.
    travelBeforeMinutes: e.travelBeforeMinutes,
    prepBeforeMinutes: e.prepBeforeMinutes,
    blockedMinutes: blocked.blockedMinutes,
    blockedFrom: blocked.blockedFrom.toISOString(),
    blockedFromTime: blocked.blockedFromTime,
    leaveAtTime: blocked.leaveAtTime,
    completedAt: e.completedAt?.toISOString() ?? null,
    createdAt: e.createdAt.toISOString(),
    updatedAt: e.updatedAt.toISOString(),
  };
}

export type SerializedEvent = ReturnType<typeof serializeEvent>;

async function findOwnedEvent(userId: string, eventId: string) {
  const event = await prisma.event.findFirst({ where: { id: eventId, userId } });
  if (!event) throw notFound('Événement');
  return event;
}

const endBeforeStart = () =>
  new AppError(400, 'VALIDATION_ERROR', "L'heure de fin doit suivre l'heure de début", [
    { field: 'endTime', message: "L'heure de fin doit suivre l'heure de début" },
  ]);

export async function createEvent(userId: string, timezone: string, input: z.infer<typeof createEventSchema>) {
  const links = await resolveLinks(userId, input.goalId, input.milestoneId);
  const event = await prisma.event.create({
    data: {
      id: input.id,
      userId,
      type: input.type,
      title: input.title,
      startsAt: localToUtc(input.date, input.startTime, timezone),
      endsAt: localToUtc(input.date, input.endTime, timezone),
      location: input.location ?? null,
      link: input.link ?? null,
      participants: input.participants ?? [],
      agenda: input.agenda ?? null,
      travelBeforeMinutes: input.travelBeforeMinutes ?? 0,
      prepBeforeMinutes: input.prepBeforeMinutes ?? 0,
      ...links,
    },
  });
  return serializeEvent(event, timezone);
}

export async function listEvents(userId: string, timezone: string, q: z.infer<typeof listEventsQuery>) {
  const where: Prisma.EventWhereInput = { userId, status: q.status };
  if (q.from || q.to) {
    const bounds = localDaysToUtc(q.from ?? q.to!, q.to ?? q.from!, timezone);
    where.startsAt = { gte: q.from ? bounds.start : undefined, lt: q.to ? bounds.end : undefined };
  }
  const items = await prisma.event.findMany({ where, orderBy: { startsAt: 'asc' }, take: q.limit });
  return items.map((e) => serializeEvent(e, timezone));
}

/** Événements non annulés d'un jour local, pour la vue « Aujourd'hui ». */
export async function eventsOfDay(userId: string, timezone: string, date: string) {
  const { start, end } = localDaysToUtc(date, date, timezone);
  const items = await prisma.event.findMany({
    where: { userId, status: { not: 'ANNULE' }, startsAt: { gte: start, lt: end } },
    orderBy: { startsAt: 'asc' },
  });
  return items.map((e) => serializeEvent(e, timezone));
}

export async function getEvent(userId: string, eventId: string, timezone: string, today: string) {
  const event = await findOwnedEvent(userId, eventId);
  const tasks = await prisma.task.findMany({ where: { userId, eventId }, orderBy: { createdAt: 'asc' } });
  return { ...serializeEvent(event, timezone), tasks: tasks.map((t) => serializeTask(t, today)) };
}

export async function updateEvent(userId: string, eventId: string, timezone: string, input: z.infer<typeof updateEventSchema>) {
  const existing = await findOwnedEvent(userId, eventId);
  const current = {
    date: utcToLocal(existing.startsAt, timezone).date,
    startTime: utcToLocal(existing.startsAt, timezone).time,
    endTime: utcToLocal(existing.endsAt, timezone).time,
  };
  const date = input.date ?? current.date;
  const startTime = input.startTime ?? current.startTime;
  const endTime = input.endTime ?? current.endTime;
  if (endTime <= startTime) throw endBeforeStart();

  const data: Prisma.EventUncheckedUpdateInput = {
    type: input.type,
    title: input.title,
    location: input.location,
    link: input.link,
    participants: input.participants,
    agenda: input.agenda,
    travelBeforeMinutes: input.travelBeforeMinutes,
    prepBeforeMinutes: input.prepBeforeMinutes,
  };
  if (input.date || input.startTime || input.endTime) {
    data.startsAt = localToUtc(date, startTime, timezone);
    data.endsAt = localToUtc(date, endTime, timezone);
  }
  if (input.goalId !== undefined || input.milestoneId !== undefined) {
    const links = await resolveLinks(
      userId,
      input.goalId === undefined ? existing.goalId : input.goalId,
      input.milestoneId === undefined ? existing.milestoneId : input.milestoneId,
    );
    data.goalId = links.goalId;
    data.milestoneId = links.milestoneId;
  }
  const event = await prisma.event.update({ where: { id: eventId }, data });
  return serializeEvent(event, timezone);
}

export async function deleteEvent(userId: string, eventId: string) {
  await findOwnedEvent(userId, eventId);
  // Les tâches liées sont conservées (event_id mis à NULL par la base).
  await prisma.event.delete({ where: { id: eventId } });
}

const conflict = (message: string) => new AppError(409, 'CONFLICT', message);

/** Réalisé : idempotent. Les décisions déjà notées sont conservées si le corps n'en fournit pas. */
export async function completeEvent(userId: string, eventId: string, timezone: string, input: z.infer<typeof completeEventSchema>) {
  const existing = await findOwnedEvent(userId, eventId);
  if (existing.status === 'ANNULE') throw conflict('Un événement annulé ne peut pas être réalisé : rouvre-le d’abord');
  const event = await prisma.event.update({
    where: { id: eventId },
    data: {
      status: 'REALISE',
      completedAt: existing.completedAt ?? new Date(),
      decisions: input.decisions === undefined ? undefined : input.decisions,
    },
  });
  return serializeEvent(event, timezone);
}

export async function reopenEvent(userId: string, eventId: string, timezone: string) {
  const existing = await findOwnedEvent(userId, eventId);
  if (existing.status === 'PREVU') return serializeEvent(existing, timezone);
  const event = await prisma.event.update({ where: { id: eventId }, data: { status: 'PREVU', completedAt: null } });
  return serializeEvent(event, timezone);
}

export async function cancelEvent(userId: string, eventId: string, timezone: string) {
  const existing = await findOwnedEvent(userId, eventId);
  if (existing.status === 'ANNULE') return serializeEvent(existing, timezone);
  if (existing.status === 'REALISE') throw conflict('Un événement réalisé ne peut pas être annulé : rouvre-le d’abord');
  const event = await prisma.event.update({ where: { id: eventId }, data: { status: 'ANNULE' } });
  return serializeEvent(event, timezone);
}

/** Crée une tâche de préparation ou de suivi liée à l'événement (objectif et jalon hérités). */
export async function createEventTask(
  userId: string,
  eventId: string,
  timezone: string,
  today: string,
  input: z.infer<typeof createEventTaskSchema>,
) {
  const event = await findOwnedEvent(userId, eventId);
  const prefix = input.role === 'PREPARATION' ? 'Préparer : ' : 'Suivi : ';
  const title = input.title ?? `${prefix}${event.title}`.slice(0, 160);
  const workDate = input.workDate === undefined ? defaultTaskDate(input.role, utcToLocal(event.startsAt, timezone).date, today) : input.workDate;
  const task = await prisma.task.create({
    data: {
      userId,
      title,
      goalId: event.goalId,
      milestoneId: event.milestoneId,
      eventId: event.id,
      eventRole: input.role,
      workDate: workDate ? toDbDate(workDate) : null,
      originalDate: workDate ? toDbDate(workDate) : null,
    },
  });
  return serializeTask(task, today);
}
