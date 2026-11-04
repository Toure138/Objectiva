import { parseInput } from '../errors';
import { periodRange } from '../reviews.rules';
import { reviewQuery, todayQuery } from '../reviews.schemas';
import { loadRelations } from './goals';
import type { Ctx, Repo } from './repo';
import { ACTIVE_GOAL_STATUSES } from './rows';
import { buildReview, buildToday } from './views';

/**
 * Vue « Aujourd'hui ». Les rendez-vous (`events`) ne sont pas encore dans l'interface de stockage
 * partagée : l'appelant les fournit (serveur : base ; téléphone : liste vide jusqu'à la phase 2).
 */
export async function getToday(repo: Repo, ctx: Ctx, rawQuery: unknown, events: (date: string) => Promise<unknown[]>) {
  const { date: asked } = parseInput(todayQuery, rawQuery);
  const date = asked ?? ctx.today;
  const [planned, done, toReschedule, overdue, goalsWithoutNextAction, dayEvents] = await Promise.all([
    repo.tasks.planned(date),
    repo.tasks.done(date),
    repo.tasks.toReschedule(date),
    repo.tasks.overdue(date),
    repo.goals.withoutNextAction(),
    events(date),
  ]);
  return buildToday(date, { planned, done, toReschedule, overdue, goalsWithoutNextAction }, dayEvents);
}

/** Bilan d'une période (jour, semaine, mois ou bornes explicites). */
export async function getReview(repo: Repo, ctx: Ctx, rawQuery: unknown, eventsSummary: (from: string, to: string) => Promise<unknown>) {
  const q = parseInput(reviewQuery, rawQuery);
  const range = q.period ? periodRange(q.period, q.date ?? ctx.today) : { from: q.from!, to: q.to! };
  const [tasks, goals, events] = await Promise.all([
    repo.tasks.inRange(range.from, range.to),
    repo.goals.list({ statusIn: ACTIVE_GOAL_STATUSES }),
    eventsSummary(range.from, range.to),
  ]);
  const rel = await loadRelations(repo, goals.map((g) => g.id));
  return buildReview(ctx.timezone, range.from, range.to, tasks, goals.map((goal) => ({ goal, rel: rel.get(goal.id)! })), events);
}
