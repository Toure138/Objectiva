import { toDbDate } from '../../core/dates.ts';
import { prisma } from '../../core/prisma.ts';
import { ACTIVE_GOAL_STATUSES } from '../goals/goals.rules.ts';
import { serializeTask } from '../tasks/tasks.service.ts';

export async function getToday(userId: string, date: string) {
  const day = toDbDate(date);
  const [planned, done, toReschedule, overdue, goalsWithoutNext] = await Promise.all([
    prisma.task.findMany({ where: { userId, status: 'TODO', workDate: day }, orderBy: { createdAt: 'asc' } }),
    prisma.task.findMany({ where: { userId, status: 'DONE', workDate: day }, orderBy: { completedAt: 'asc' } }),
    prisma.task.findMany({ where: { userId, status: 'TODO', workDate: { lt: day } }, orderBy: { workDate: 'asc' } }),
    // Échéance dépassée sans date de travail ou prévue plus tard : sinon déjà visible ailleurs.
    prisma.task.findMany({
      where: {
        userId,
        status: 'TODO',
        dueDate: { lt: day },
        OR: [{ workDate: null }, { workDate: { gt: day } }],
      },
      orderBy: { dueDate: 'asc' },
    }),
    prisma.goal.findMany({
      where: { userId, status: { in: [...ACTIVE_GOAL_STATUSES] }, tasks: { none: { status: 'TODO' } } },
      select: { id: true, title: true },
      orderBy: { endDate: 'asc' },
    }),
  ]);

  const s = (t: Parameters<typeof serializeTask>[0]) => serializeTask(t, date);
  return {
    date,
    planned: planned.map(s),
    done: done.map(s),
    toReschedule: toReschedule.map(s),
    overdue: overdue.map(s),
    goalsWithoutNextAction: goalsWithoutNext,
    emptyMessage: planned.length === 0 && done.length === 0 ? 'Aucune action prévue' : null,
  };
}
