import { z } from 'zod';
import { fromDbDate, toDbDate } from '../../core/dates.ts';
import { AppError, notFound } from '../../core/errors.ts';
import { prisma } from '../../core/prisma.ts';
import type { Goal, Milestone, Task } from '../../generated/prisma/client.ts';
import { serializeTask } from '../tasks/tasks.service.ts';
import { ACTIVE_GOAL_STATUSES, milestoneProgress } from './goals.rules.ts';
import type {
  createGoalSchema,
  createMilestoneSchema,
  listGoalsQuery,
  updateGoalSchema,
  updateMilestoneSchema,
} from './goals.schemas.ts';

export function serializeMilestone(m: Milestone) {
  return {
    id: m.id,
    goalId: m.goalId,
    title: m.title,
    dueDate: fromDbDate(m.dueDate),
    completed: m.completedAt !== null,
    completedAt: m.completedAt?.toISOString() ?? null,
  };
}

// Prochaine action : la tâche ouverte la plus proche ; les tâches sans date viennent après.
function pickNextAction(tasks: Task[]): Task | null {
  const open = tasks.filter((t) => t.status === 'TODO');
  open.sort((a, b) => {
    if (a.workDate && b.workDate) return a.workDate.getTime() - b.workDate.getTime();
    if (a.workDate) return -1;
    if (b.workDate) return 1;
    return a.createdAt.getTime() - b.createdAt.getTime();
  });
  return open[0] ?? null;
}

function serializeGoal(g: Goal & { milestones: Milestone[]; tasks: Task[] }, today: string) {
  const next = pickNextAction(g.tasks);
  const isActive = (ACTIVE_GOAL_STATUSES as readonly string[]).includes(g.status);
  return {
    id: g.id,
    title: g.title,
    description: g.description,
    motivation: g.motivation,
    category: g.category,
    horizon: g.horizon,
    startDate: fromDbDate(g.startDate),
    endDate: fromDbDate(g.endDate),
    priority: g.priority,
    status: g.status,
    progress: milestoneProgress(g.milestones),
    nextAction: next ? serializeTask(next, today) : null,
    // Invite à planifier quand un objectif actif n'a plus rien de prévu.
    needsNextAction: isActive && next === null,
    createdAt: g.createdAt.toISOString(),
    updatedAt: g.updatedAt.toISOString(),
  };
}

const withRelations = {
  milestones: { orderBy: [{ dueDate: 'asc' as const }, { createdAt: 'asc' as const }] },
  tasks: true,
};

async function findOwnedGoal(userId: string, goalId: string) {
  const goal = await prisma.goal.findFirst({ where: { id: goalId, userId }, include: withRelations });
  if (!goal) throw notFound('Objectif');
  return goal;
}

export async function listGoals(userId: string, today: string, query: z.infer<typeof listGoalsQuery>) {
  const goals = await prisma.goal.findMany({
    where: { userId, status: query.status, category: query.category },
    include: withRelations,
    orderBy: [{ endDate: 'asc' }, { createdAt: 'asc' }],
  });
  return goals.map((g) => serializeGoal(g, today));
}

export async function getGoal(userId: string, goalId: string, today: string) {
  const goal = await findOwnedGoal(userId, goalId);
  return {
    ...serializeGoal(goal, today),
    milestones: goal.milestones.map(serializeMilestone),
    tasks: goal.tasks
      .sort((a, b) => (a.workDate?.getTime() ?? Infinity) - (b.workDate?.getTime() ?? Infinity))
      .map((t) => serializeTask(t, today)),
  };
}

export async function createGoal(userId: string, today: string, input: z.infer<typeof createGoalSchema>) {
  const goal = await prisma.goal.create({
    data: {
      ...input,
      userId,
      startDate: toDbDate(input.startDate),
      endDate: toDbDate(input.endDate),
    },
    include: withRelations,
  });
  return serializeGoal(goal, today);
}

export async function updateGoal(userId: string, goalId: string, today: string, input: z.infer<typeof updateGoalSchema>) {
  const existing = await findOwnedGoal(userId, goalId);
  const start = input.startDate ?? fromDbDate(existing.startDate)!;
  const end = input.endDate ?? fromDbDate(existing.endDate)!;
  if (end < start) {
    throw new AppError(400, 'VALIDATION_ERROR', "L'échéance doit suivre la date de début", [
      { field: 'endDate', message: "L'échéance doit suivre la date de début" },
    ]);
  }
  const goal = await prisma.goal.update({
    where: { id: goalId },
    data: {
      ...input,
      startDate: input.startDate ? toDbDate(input.startDate) : undefined,
      endDate: input.endDate ? toDbDate(input.endDate) : undefined,
    },
    include: withRelations,
  });
  return serializeGoal(goal, today);
}

export async function deleteGoal(userId: string, goalId: string) {
  await findOwnedGoal(userId, goalId);
  // Les tâches liées sont conservées (goal_id mis à NULL par la base) : le travail fait reste.
  await prisma.goal.delete({ where: { id: goalId } });
}

export async function createMilestone(userId: string, goalId: string, input: z.infer<typeof createMilestoneSchema>) {
  await findOwnedGoal(userId, goalId);
  const m = await prisma.milestone.create({
    data: { goalId, title: input.title, dueDate: input.dueDate ? toDbDate(input.dueDate) : null },
  });
  return serializeMilestone(m);
}

async function findOwnedMilestone(userId: string, milestoneId: string) {
  const m = await prisma.milestone.findFirst({ where: { id: milestoneId, goal: { userId } } });
  if (!m) throw notFound('Jalon');
  return m;
}

export async function updateMilestone(userId: string, milestoneId: string, input: z.infer<typeof updateMilestoneSchema>) {
  const existing = await findOwnedMilestone(userId, milestoneId);
  let completedAt: Date | null | undefined;
  if (input.completed === true) completedAt = existing.completedAt ?? new Date();
  else if (input.completed === false) completedAt = null;

  const m = await prisma.milestone.update({
    where: { id: milestoneId },
    data: {
      title: input.title,
      dueDate: input.dueDate === undefined ? undefined : input.dueDate ? toDbDate(input.dueDate) : null,
      completedAt,
    },
  });
  return serializeMilestone(m);
}

export async function deleteMilestone(userId: string, milestoneId: string) {
  await findOwnedMilestone(userId, milestoneId);
  await prisma.milestone.delete({ where: { id: milestoneId } });
}
