import { todayIn } from '../../../shared/src/dates.ts';
import type {
  Ctx,
  EventQuery,
  EventRepo,
  GoalQuery,
  GoalRepo,
  MilestoneRepo,
  ReadingRepo,
  Repo,
  SeriesRepo,
  TaskQuery,
  TaskRepo,
} from '../../../shared/src/domain/repo.ts';
import type { EventRow, GoalRow, MilestoneRow, ReadingRow, SeriesRow, TaskRow } from '../../../shared/src/domain/rows.ts';
import { ACTIVE_GOAL_STATUSES } from '../../../shared/src/domain/rows.ts';
import type { Event, EventSeries, Goal, GoalReading, Milestone, Prisma, Task } from '../generated/prisma/client.ts';
import { fromDbDate, toDbDate } from '../../../shared/src/dates.ts';
import { prisma } from './prisma.ts';

// Implémentation Prisma de l'interface de stockage partagée (shared/src/domain/repo.ts).
// Toute requête est filtrée par `userId` : une ressource d'autrui est « introuvable ».

const iso = (d: Date | null): string | null => (d ? d.toISOString() : null);
const day = (d: Date | null): string | null => fromDbDate(d);
export const dbDay = (s: string | null | undefined): Date | null | undefined => (s === undefined ? undefined : s === null ? null : toDbDate(s));
export const dbInstant = (s: string | null | undefined): Date | null | undefined => (s === undefined ? undefined : s === null ? null : new Date(s));

export function toGoalRow(g: Goal): GoalRow {
  return {
    id: g.id,
    title: g.title,
    description: g.description,
    motivation: g.motivation,
    category: g.category,
    horizon: g.horizon,
    startDate: day(g.startDate)!,
    endDate: day(g.endDate)!,
    priority: g.priority,
    status: g.status,
    progressMode: g.progressMode,
    measureUnit: g.measureUnit,
    startValue: g.startValue,
    targetValue: g.targetValue,
    createdAt: g.createdAt.toISOString(),
    updatedAt: g.updatedAt.toISOString(),
  };
}

export function toMilestoneRow(m: Milestone): MilestoneRow {
  return {
    id: m.id,
    goalId: m.goalId,
    title: m.title,
    dueDate: day(m.dueDate),
    completedAt: iso(m.completedAt),
    createdAt: m.createdAt.toISOString(),
    updatedAt: m.updatedAt.toISOString(),
  };
}

export function toReadingRow(r: GoalReading): ReadingRow {
  return {
    id: r.id,
    goalId: r.goalId,
    value: r.value,
    readOn: day(r.readOn)!,
    note: r.note,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

export function toTaskRow(t: Task): TaskRow {
  return {
    id: t.id,
    goalId: t.goalId,
    milestoneId: t.milestoneId,
    eventId: t.eventId,
    eventRole: t.eventRole,
    title: t.title,
    notes: t.notes,
    workDate: day(t.workDate),
    dueDate: day(t.dueDate),
    status: t.status,
    completedAt: iso(t.completedAt),
    originalDate: day(t.originalDate),
    rescheduleCount: t.rescheduleCount,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  };
}

export function toEventRow(e: Event): EventRow {
  return {
    id: e.id,
    seriesId: e.seriesId,
    occurrenceDate: day(e.occurrenceDate),
    goalId: e.goalId,
    milestoneId: e.milestoneId,
    type: e.type,
    title: e.title,
    startsAt: e.startsAt.toISOString(),
    endsAt: e.endsAt.toISOString(),
    location: e.location,
    link: e.link,
    participants: e.participants,
    agenda: e.agenda,
    decisions: e.decisions,
    status: e.status,
    travelBeforeMinutes: e.travelBeforeMinutes,
    prepBeforeMinutes: e.prepBeforeMinutes,
    reminder: e.reminder,
    completedAt: iso(e.completedAt),
    createdAt: e.createdAt.toISOString(),
    updatedAt: e.updatedAt.toISOString(),
  };
}

export function toSeriesRow(s: EventSeries): SeriesRow {
  return {
    id: s.id,
    goalId: s.goalId,
    milestoneId: s.milestoneId,
    type: s.type,
    title: s.title,
    startTime: s.startTime,
    endTime: s.endTime,
    location: s.location,
    link: s.link,
    participants: s.participants,
    agenda: s.agenda,
    travelBeforeMinutes: s.travelBeforeMinutes,
    prepBeforeMinutes: s.prepBeforeMinutes,
    reminder: s.reminder,
    weekdays: s.weekdays,
    startDate: day(s.startDate)!,
    until: day(s.until),
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
  };
}

/** Colonnes Prisma d'un correctif de rendez-vous (dates et instants convertis). */
export function eventData(p: Partial<EventRow>): Prisma.EventUncheckedUpdateInput {
  return {
    seriesId: p.seriesId,
    occurrenceDate: dbDay(p.occurrenceDate),
    goalId: p.goalId,
    milestoneId: p.milestoneId,
    type: p.type,
    title: p.title,
    startsAt: dbInstant(p.startsAt) ?? undefined,
    endsAt: dbInstant(p.endsAt) ?? undefined,
    location: p.location,
    link: p.link,
    participants: p.participants,
    agenda: p.agenda,
    decisions: p.decisions,
    status: p.status,
    travelBeforeMinutes: p.travelBeforeMinutes,
    prepBeforeMinutes: p.prepBeforeMinutes,
    reminder: p.reminder,
    completedAt: dbInstant(p.completedAt),
  };
}

export function seriesData(p: Partial<SeriesRow>): Prisma.EventSeriesUncheckedUpdateInput {
  return {
    goalId: p.goalId,
    milestoneId: p.milestoneId,
    type: p.type,
    title: p.title,
    startTime: p.startTime,
    endTime: p.endTime,
    location: p.location,
    link: p.link,
    participants: p.participants,
    agenda: p.agenda,
    travelBeforeMinutes: p.travelBeforeMinutes,
    prepBeforeMinutes: p.prepBeforeMinutes,
    reminder: p.reminder,
    weekdays: p.weekdays,
    startDate: dbDay(p.startDate) ?? undefined,
    until: dbDay(p.until),
  };
}

/** Colonnes Prisma d'un correctif de tâche (dates et instants convertis). `updatedAt` est posé par la base. */
export function taskData(p: Partial<TaskRow>): Prisma.TaskUncheckedUpdateInput {
  return {
    goalId: p.goalId,
    milestoneId: p.milestoneId,
    eventId: p.eventId,
    eventRole: p.eventRole,
    title: p.title,
    notes: p.notes,
    workDate: dbDay(p.workDate),
    dueDate: dbDay(p.dueDate),
    status: p.status,
    completedAt: dbInstant(p.completedAt),
    originalDate: dbDay(p.originalDate),
    rescheduleCount: p.rescheduleCount,
  };
}

export function goalData(p: Partial<GoalRow>): Prisma.GoalUncheckedUpdateInput {
  return {
    title: p.title,
    description: p.description,
    motivation: p.motivation,
    category: p.category,
    horizon: p.horizon,
    startDate: dbDay(p.startDate) ?? undefined,
    endDate: dbDay(p.endDate) ?? undefined,
    priority: p.priority,
    status: p.status,
    progressMode: p.progressMode,
    measureUnit: p.measureUnit,
    startValue: p.startValue,
    targetValue: p.targetValue,
  };
}

function taskRepo(userId: string): TaskRepo {
  const open = { userId, status: 'TODO' as const };
  const order = [{ createdAt: 'asc' as const }, { id: 'asc' as const }];
  return {
    async get(id) {
      const t = await prisma.task.findFirst({ where: { id, userId } });
      return t ? toTaskRow(t) : null;
    },
    async list(q: TaskQuery) {
      const where: Prisma.TaskWhereInput = { userId, status: q.status, goalId: q.goalId };
      if (q.unscheduled) {
        where.workDate = null;
      } else if (q.from || q.to) {
        where.workDate = { gte: q.from ? toDbDate(q.from) : undefined, lte: q.to ? toDbDate(q.to) : undefined };
      }
      const [items, total] = await prisma.$transaction([
        prisma.task.findMany({
          where,
          orderBy: [{ workDate: { sort: 'asc', nulls: 'last' } }, ...order],
          take: q.limit,
          skip: q.offset,
        }),
        prisma.task.count({ where }),
      ]);
      return { items: items.map(toTaskRow), total };
    },
    async listByGoals(goalIds) {
      return (await prisma.task.findMany({ where: { userId, goalId: { in: goalIds } } })).map(toTaskRow);
    },
    async planned(date) {
      return (await prisma.task.findMany({ where: { ...open, workDate: toDbDate(date) }, orderBy: order })).map(toTaskRow);
    },
    async done(date) {
      const where = { userId, status: 'DONE' as const, workDate: toDbDate(date) };
      return (await prisma.task.findMany({ where, orderBy: [{ completedAt: 'asc' }, { id: 'asc' }] })).map(toTaskRow);
    },
    async toReschedule(date) {
      const where = { ...open, workDate: { lt: toDbDate(date) } };
      return (await prisma.task.findMany({ where, orderBy: [{ workDate: 'asc' }, ...order] })).map(toTaskRow);
    },
    async overdue(date) {
      const d = toDbDate(date);
      // Échéance dépassée sans date de travail ou prévue plus tard : sinon déjà visible ailleurs.
      const where = { ...open, dueDate: { lt: d }, OR: [{ workDate: null }, { workDate: { gt: d } }] };
      return (await prisma.task.findMany({ where, orderBy: [{ dueDate: 'asc' }, ...order] })).map(toTaskRow);
    },
    async inRange(from, to) {
      const range = { gte: toDbDate(from), lte: toDbDate(to) };
      return (await prisma.task.findMany({ where: { userId, OR: [{ workDate: range }, { originalDate: range }] } })).map(toTaskRow);
    },
    async byEvent(eventId) {
      return (await prisma.task.findMany({ where: { userId, eventId }, orderBy: order })).map(toTaskRow);
    },
    async insert(row) {
      await prisma.task.create({
        data: { ...(taskData(row) as Prisma.TaskUncheckedCreateInput), id: row.id, userId, createdAt: new Date(row.createdAt) },
      });
    },
    async update(id, patch) {
      return toTaskRow(await prisma.task.update({ where: { id, userId }, data: taskData(patch) }));
    },
    async remove(id) {
      await prisma.task.deleteMany({ where: { id, userId } });
    },
  };
}

function goalRepo(userId: string): GoalRepo {
  return {
    async get(id) {
      const g = await prisma.goal.findFirst({ where: { id, userId } });
      return g ? toGoalRow(g) : null;
    },
    async list(q: GoalQuery) {
      const where: Prisma.GoalWhereInput = { userId, category: q.category };
      if (q.status) where.status = q.status;
      else if (q.statusIn) where.status = { in: [...q.statusIn] };
      const goals = await prisma.goal.findMany({ where, orderBy: [{ endDate: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }] });
      return goals.map(toGoalRow);
    },
    async withoutNextAction() {
      return prisma.goal.findMany({
        where: { userId, status: { in: [...ACTIVE_GOAL_STATUSES] }, tasks: { none: { status: 'TODO' } } },
        select: { id: true, title: true },
        orderBy: [{ endDate: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
      });
    },
    async insert(row) {
      await prisma.goal.create({
        data: {
          ...(goalData(row) as Prisma.GoalUncheckedCreateInput),
          id: row.id,
          userId,
          startDate: toDbDate(row.startDate),
          endDate: toDbDate(row.endDate),
          createdAt: new Date(row.createdAt),
        },
      });
    },
    async update(id, patch) {
      return toGoalRow(await prisma.goal.update({ where: { id, userId }, data: goalData(patch) }));
    },
    async remove(id) {
      // La base supprime jalons et relevés (cascade) et détache les tâches (SET NULL).
      await prisma.goal.deleteMany({ where: { id, userId } });
    },
  };
}

function milestoneRepo(userId: string): MilestoneRepo {
  return {
    async get(id) {
      const m = await prisma.milestone.findFirst({ where: { id, userId } });
      return m ? toMilestoneRow(m) : null;
    },
    async listByGoals(goalIds) {
      return (await prisma.milestone.findMany({ where: { userId, goalId: { in: goalIds } } })).map(toMilestoneRow);
    },
    async insert(row) {
      await prisma.milestone.create({
        data: {
          id: row.id,
          userId,
          goalId: row.goalId,
          title: row.title,
          dueDate: dbDay(row.dueDate),
          completedAt: dbInstant(row.completedAt),
          createdAt: new Date(row.createdAt),
        },
      });
    },
    async update(id, patch) {
      const m = await prisma.milestone.update({
        where: { id, userId },
        data: { title: patch.title, dueDate: dbDay(patch.dueDate), completedAt: dbInstant(patch.completedAt) },
      });
      return toMilestoneRow(m);
    },
    async remove(id) {
      await prisma.milestone.deleteMany({ where: { id, userId } });
    },
  };
}

function readingRepo(userId: string): ReadingRepo {
  return {
    async get(id) {
      const r = await prisma.goalReading.findFirst({ where: { id, userId } });
      return r ? toReadingRow(r) : null;
    },
    async listByGoals(goalIds) {
      const perGoal = await Promise.all(
        goalIds.map((goalId) =>
          prisma.goalReading.findMany({
            where: { userId, goalId },
            orderBy: [{ readOn: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
            take: 50,
          }),
        ),
      );
      return perGoal.flat().map(toReadingRow);
    },
    async insert(row) {
      await prisma.goalReading.create({
        data: { id: row.id, userId, goalId: row.goalId, value: row.value, readOn: toDbDate(row.readOn), note: row.note, createdAt: new Date(row.createdAt) },
      });
    },
    async remove(id) {
      await prisma.goalReading.deleteMany({ where: { id, userId } });
    },
  };
}

const isUniqueViolation = (e: unknown): boolean =>
  typeof e === 'object' && e !== null && 'code' in e && (e as { code: unknown }).code === 'P2002';

function eventRepo(userId: string): EventRepo {
  const order = [{ startsAt: 'asc' as const }, { createdAt: 'asc' as const }, { id: 'asc' as const }];
  const create = (row: EventRow) =>
    prisma.event.create({
      data: {
        ...(eventData(row) as Prisma.EventUncheckedCreateInput),
        id: row.id,
        userId,
        startsAt: new Date(row.startsAt),
        endsAt: new Date(row.endsAt),
        createdAt: new Date(row.createdAt),
      },
    });
  return {
    async get(id) {
      const e = await prisma.event.findFirst({ where: { id, userId } });
      return e ? toEventRow(e) : null;
    },
    async list(q: EventQuery) {
      const where: Prisma.EventWhereInput = { userId };
      if (q.status) where.status = q.status;
      else if (q.notStatus) where.status = { not: q.notStatus };
      if (q.startFrom || q.startBefore) {
        where.startsAt = { gte: q.startFrom ? new Date(q.startFrom) : undefined, lt: q.startBefore ? new Date(q.startBefore) : undefined };
      }
      return (await prisma.event.findMany({ where, orderBy: order, take: q.limit })).map(toEventRow);
    },
    async bySeries(seriesId) {
      return (await prisma.event.findMany({ where: { userId, seriesId }, orderBy: [{ occurrenceDate: 'asc' }] })).map(toEventRow);
    },
    async insert(row) {
      await create(row);
    },
    async insertIfAbsent(row) {
      try {
        await create(row);
        return true;
      } catch (e) {
        // Créée entre-temps par une autre requête (ou un autre appareil) : rien à faire.
        if (isUniqueViolation(e)) return false;
        throw e;
      }
    },
    async update(id, patch) {
      return toEventRow(await prisma.event.update({ where: { id, userId }, data: eventData(patch) }));
    },
    async remove(id) {
      // Les tâches liées sont conservées : la base met leur event_id à NULL.
      await prisma.event.deleteMany({ where: { id, userId } });
    },
  };
}

function seriesRepo(userId: string): SeriesRepo {
  return {
    async get(id) {
      const s = await prisma.eventSeries.findFirst({ where: { id, userId } });
      return s ? toSeriesRow(s) : null;
    },
    async list() {
      const rows = await prisma.eventSeries.findMany({ where: { userId }, orderBy: [{ startDate: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }] });
      return rows.map(toSeriesRow);
    },
    async insert(row) {
      await prisma.eventSeries.create({
        data: {
          ...(seriesData(row) as Prisma.EventSeriesUncheckedCreateInput),
          id: row.id,
          userId,
          startDate: toDbDate(row.startDate),
          createdAt: new Date(row.createdAt),
        },
      });
    },
    async update(id, patch) {
      return toSeriesRow(await prisma.eventSeries.update({ where: { id, userId }, data: seriesData(patch) }));
    },
    async remove(id) {
      // La base supprime les occurrences (cascade) et détache leurs tâches (SET NULL).
      await prisma.eventSeries.deleteMany({ where: { id, userId } });
    },
  };
}

/** Interface de stockage partagée, limitée aux données d'un utilisateur. */
export function prismaRepo(userId: string): Repo {
  return {
    tasks: taskRepo(userId),
    goals: goalRepo(userId),
    milestones: milestoneRepo(userId),
    readings: readingRepo(userId),
    events: eventRepo(userId),
    series: seriesRepo(userId),
  };
}

/** Contexte d'une commande : horloge du serveur et jour courant dans le fuseau de l'utilisateur. */
export function ctxFor(timezone: string, now = new Date()): Ctx {
  return { now: now.toISOString(), today: todayIn(timezone, now), timezone };
}
