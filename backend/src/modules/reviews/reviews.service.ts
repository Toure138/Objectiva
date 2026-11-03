import { fromDbDate, toDbDate, todayIn } from '../../core/dates.ts';
import { prisma } from '../../core/prisma.ts';
import { ACTIVE_GOAL_STATUSES, milestoneProgress } from '../goals/goals.rules.ts';
import { reviewTasks } from './reviews.rules.ts';

export async function getReview(userId: string, timezone: string, from: string, to: string) {
  const fromDb = toDbDate(from);
  const toDb = toDbDate(to);
  const inRange = { gte: fromDb, lte: toDb };

  const [tasks, goals] = await Promise.all([
    prisma.task.findMany({
      where: { userId, OR: [{ workDate: inRange }, { originalDate: inRange }] },
      select: { status: true, workDate: true, originalDate: true, createdAt: true },
    }),
    prisma.goal.findMany({
      where: { userId, status: { in: [...ACTIVE_GOAL_STATUSES] } },
      select: { id: true, title: true, milestones: { select: { completedAt: true } } },
      orderBy: { endDate: 'asc' },
    }),
  ]);

  const taskReview = reviewTasks(
    tasks.map((t) => ({
      status: t.status,
      workDate: fromDbDate(t.workDate),
      originalDate: fromDbDate(t.originalDate),
      createdDate: todayIn(timezone, t.createdAt),
    })),
    from,
    to,
  );

  return {
    from,
    to,
    tasks: taskReview,
    goals: goals.map((g) => {
      const progress = milestoneProgress(g.milestones);
      // Jalons terminés pendant la période, d'après le jour local de réalisation.
      const milestonesDoneInPeriod = g.milestones.filter((m) => {
        if (!m.completedAt) return false;
        const day = todayIn(timezone, m.completedAt);
        return day >= from && day <= to;
      }).length;
      return { id: g.id, title: g.title, progress, milestonesDoneInPeriod };
    }),
    questions: ["Qu'ai-je accompli ?", "Qu'est-ce qui m'a bloqué ?", 'Quelle est ma prochaine priorité ?'],
  };
}
