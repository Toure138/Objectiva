import { z } from 'zod';
import { fromDbDate, toDbDate } from '../../core/dates.ts';
import { AppError, notFound } from '../../core/errors.ts';
import { prisma } from '../../core/prisma.ts';
import type { Prisma, Task } from '../../generated/prisma/client.ts';
import { applyWorkDateChange, taskFlags } from './tasks.rules.ts';
import type { createTaskSchema, listTasksQuery, rescheduleSchema, updateTaskSchema } from './tasks.schemas.ts';

export function serializeTask(t: Task, today: string) {
  const base = {
    id: t.id,
    title: t.title,
    notes: t.notes,
    goalId: t.goalId,
    milestoneId: t.milestoneId,
    eventId: t.eventId,
    eventRole: t.eventRole,
    workDate: fromDbDate(t.workDate),
    dueDate: fromDbDate(t.dueDate),
    originalDate: fromDbDate(t.originalDate),
    rescheduleCount: t.rescheduleCount,
    status: t.status,
    completedAt: t.completedAt?.toISOString() ?? null,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  };
  return { ...base, ...taskFlags(base, today) };
}

export type SerializedTask = ReturnType<typeof serializeTask>;

async function findOwnedTask(userId: string, taskId: string) {
  const task = await prisma.task.findFirst({ where: { id: taskId, userId } });
  if (!task) throw notFound('Tâche');
  return task;
}

/**
 * Vérifie que l'objectif et le jalon visés appartiennent à l'utilisateur et sont cohérents.
 * Un jalon seul suffit : l'objectif est déduit du jalon.
 */
export async function resolveLinks(
  userId: string,
  goalId: string | null | undefined,
  milestoneId: string | null | undefined,
): Promise<{ goalId: string | null; milestoneId: string | null }> {
  let resolvedGoal = goalId ?? null;
  if (milestoneId) {
    const m = await prisma.milestone.findFirst({ where: { id: milestoneId, goal: { userId } }, select: { goalId: true } });
    if (!m) throw notFound('Jalon');
    if (resolvedGoal && resolvedGoal !== m.goalId) {
      throw new AppError(400, 'VALIDATION_ERROR', "Ce jalon n'appartient pas à l'objectif choisi", [
        { field: 'milestoneId', message: "Ce jalon n'appartient pas à l'objectif choisi" },
      ]);
    }
    resolvedGoal = m.goalId;
  }
  if (resolvedGoal) {
    const g = await prisma.goal.findFirst({ where: { id: resolvedGoal, userId }, select: { id: true } });
    if (!g) throw notFound('Objectif');
  }
  return { goalId: resolvedGoal, milestoneId: milestoneId ?? null };
}

export async function createTask(userId: string, today: string, input: z.infer<typeof createTaskSchema>) {
  const links = await resolveLinks(userId, input.goalId, input.milestoneId);
  const workDate = input.workDate ?? null;
  const task = await prisma.task.create({
    data: {
      id: input.id,
      userId,
      // Horloge de l'application (pas de la base) : le bilan s'en sert, et un appareil hors connexion fait de même.
      createdAt: new Date(),
      title: input.title,
      notes: input.notes ?? null,
      workDate: workDate ? toDbDate(workDate) : null,
      originalDate: workDate ? toDbDate(workDate) : null,
      dueDate: input.dueDate ? toDbDate(input.dueDate) : null,
      ...links,
    },
  });
  return serializeTask(task, today);
}

export async function listTasks(userId: string, today: string, q: z.infer<typeof listTasksQuery>) {
  const where: Prisma.TaskWhereInput = { userId, status: q.status, goalId: q.goalId };
  if (q.unscheduled) {
    where.workDate = null;
  } else if (q.from || q.to) {
    where.workDate = { gte: q.from ? toDbDate(q.from) : undefined, lte: q.to ? toDbDate(q.to) : undefined };
  }
  const [items, total] = await prisma.$transaction([
    prisma.task.findMany({
      where,
      orderBy: [{ workDate: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }],
      take: q.limit,
      skip: q.offset,
    }),
    prisma.task.count({ where }),
  ]);
  return { items: items.map((t) => serializeTask(t, today)), total, limit: q.limit, offset: q.offset };
}

export async function getTask(userId: string, taskId: string, today: string) {
  return serializeTask(await findOwnedTask(userId, taskId), today);
}

export async function updateTask(userId: string, taskId: string, today: string, input: z.infer<typeof updateTaskSchema>) {
  const existing = await findOwnedTask(userId, taskId);

  const data: Prisma.TaskUncheckedUpdateInput = {
    title: input.title,
    notes: input.notes,
    dueDate: input.dueDate === undefined ? undefined : input.dueDate ? toDbDate(input.dueDate) : null,
  };

  if (input.goalId !== undefined || input.milestoneId !== undefined) {
    // Changer d'objectif sans préciser le jalon détache l'ancien jalon (il appartient à l'ancien objectif).
    const goalId = input.goalId !== undefined ? input.goalId : existing.goalId;
    const milestoneId =
      input.milestoneId !== undefined ? input.milestoneId : input.goalId !== undefined ? null : existing.milestoneId;
    Object.assign(data, await resolveLinks(userId, goalId, milestoneId));
  }

  if (input.workDate !== undefined) {
    Object.assign(data, workDateUpdate(existing, input.workDate));
  }

  const task = await prisma.task.update({ where: { id: taskId }, data });
  return serializeTask(task, today);
}

function workDateUpdate(existing: Task, next: string | null): Prisma.TaskUncheckedUpdateInput {
  const r = applyWorkDateChange(
    {
      workDate: fromDbDate(existing.workDate),
      originalDate: fromDbDate(existing.originalDate),
      rescheduleCount: existing.rescheduleCount,
    },
    next,
  );
  if (!r.changed) return {};
  return {
    workDate: r.workDate ? toDbDate(r.workDate) : null,
    originalDate: r.originalDate ? toDbDate(r.originalDate) : null,
    rescheduleCount: r.rescheduleCount,
  };
}

export async function completeTask(userId: string, taskId: string, today: string) {
  const existing = await findOwnedTask(userId, taskId);
  // Idempotent : un double appui ne change pas la date de réalisation déjà enregistrée.
  if (existing.status === 'DONE') return serializeTask(existing, today);
  const task = await prisma.task.update({
    where: { id: taskId },
    data: { status: 'DONE', completedAt: new Date() },
  });
  return serializeTask(task, today);
}

/** Annule une validation ou une annulation par erreur : la tâche redevient « à faire ». */
export async function reopenTask(userId: string, taskId: string, today: string) {
  const existing = await findOwnedTask(userId, taskId);
  if (existing.status === 'TODO') return serializeTask(existing, today);
  const task = await prisma.task.update({ where: { id: taskId }, data: { status: 'TODO', completedAt: null } });
  return serializeTask(task, today);
}

export async function rescheduleTask(userId: string, taskId: string, today: string, input: z.infer<typeof rescheduleSchema>) {
  const existing = await findOwnedTask(userId, taskId);
  if (existing.status !== 'TODO') {
    throw new AppError(409, 'CONFLICT', 'Seule une tâche à faire peut être reportée');
  }
  const task = await prisma.task.update({ where: { id: taskId }, data: workDateUpdate(existing, input.workDate) });
  return serializeTask(task, today);
}

export async function cancelTask(userId: string, taskId: string, today: string) {
  const existing = await findOwnedTask(userId, taskId);
  if (existing.status === 'CANCELLED') return serializeTask(existing, today);
  const task = await prisma.task.update({ where: { id: taskId }, data: { status: 'CANCELLED', completedAt: null } });
  return serializeTask(task, today);
}

export async function deleteTask(userId: string, taskId: string) {
  await findOwnedTask(userId, taskId);
  await prisma.task.delete({ where: { id: taskId } });
}
