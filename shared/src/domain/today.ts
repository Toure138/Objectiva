import { parseInput } from '../errors';
import { periodRange } from '../reviews.rules';
import { reviewQuery, todayQuery } from '../reviews.schemas';
import { eventsOfDay, eventsSummary } from './events';
import { loadRelations } from './goals';
import type { Ctx, Repo } from './repo';
import { ACTIVE_GOAL_STATUSES } from './rows';
import { buildReview, buildToday } from './views';

/** Vue « Aujourd'hui » : tâches et rendez-vous du jour (occurrences des réunions récurrentes comprises). */
export async function getToday(repo: Repo, ctx: Ctx, rawQuery: unknown) {
  const { date: asked } = parseInput(todayQuery, rawQuery);
  const date = asked ?? ctx.today;
  const [planned, done, toReschedule, overdue, goalsWithoutNextAction, dayEvents] = await Promise.all([
    repo.tasks.planned(date),
    repo.tasks.done(date),
    repo.tasks.toReschedule(date),
    repo.tasks.overdue(date),
    repo.goals.withoutNextAction(),
    eventsOfDay(repo, ctx, date),
  ]);
  return buildToday(date, { planned, done, toReschedule, overdue, goalsWithoutNextAction }, dayEvents);
}

/** Bilan d'une période (jour, semaine, mois ou bornes explicites). */
export async function getReview(repo: Repo, ctx: Ctx, rawQuery: unknown) {
  const q = parseInput(reviewQuery, rawQuery);
  const range = q.period ? periodRange(q.period, q.date ?? ctx.today) : { from: q.from!, to: q.to! };
  const [tasks, goals, events] = await Promise.all([
    repo.tasks.inRange(range.from, range.to),
    repo.goals.list({ statusIn: ACTIVE_GOAL_STATUSES }),
    eventsSummary(repo, ctx, range.from, range.to),
  ]);
  const rel = await loadRelations(repo, goals.map((g) => g.id));
  return buildReview(ctx.timezone, range.from, range.to, tasks, goals.map((goal) => ({ goal, rel: rel.get(goal.id)! })), events);
}
