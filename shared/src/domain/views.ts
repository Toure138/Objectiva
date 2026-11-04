import { todayIn } from '../dates';
import { goalProgress } from '../goals.rules';
import { reviewTasks } from '../reviews.rules';
import { taskFlags } from '../tasks.rules';
import type { GoalRow, MilestoneRow, ReadingRow, TaskRow } from './rows';
import { ACTIVE_GOAL_STATUSES } from './rows';

// Vues (formes renvoyées par l'API) construites à partir de lignes. Une seule implémentation pour
// le serveur et pour le téléphone : c'est ce qui rend le calcul hors connexion identique.

export function serializeTask(t: TaskRow, today: string) {
  const base = {
    id: t.id,
    title: t.title,
    notes: t.notes,
    goalId: t.goalId,
    milestoneId: t.milestoneId,
    eventId: t.eventId,
    eventRole: t.eventRole,
    workDate: t.workDate,
    dueDate: t.dueDate,
    originalDate: t.originalDate,
    rescheduleCount: t.rescheduleCount,
    status: t.status,
    completedAt: t.completedAt,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
  };
  return { ...base, ...taskFlags(base, today) };
}
export type TaskView = ReturnType<typeof serializeTask>;

export function serializeMilestone(m: MilestoneRow) {
  return {
    id: m.id,
    goalId: m.goalId,
    title: m.title,
    dueDate: m.dueDate,
    completed: m.completedAt !== null,
    completedAt: m.completedAt,
  };
}

export function serializeReading(r: ReadingRow) {
  return { id: r.id, goalId: r.goalId, value: r.value, readOn: r.readOn, note: r.note, createdAt: r.createdAt };
}

const byText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** Date croissante, les valeurs absentes en dernier (comme PostgreSQL), puis création, puis identifiant. */
export function compareDateThenCreation(
  a: { date: string | null; createdAt: string; id: string },
  b: { date: string | null; createdAt: string; id: string },
): number {
  if (a.date !== b.date) {
    if (a.date === null) return 1;
    if (b.date === null) return -1;
    return byText(a.date, b.date);
  }
  return byText(a.createdAt, b.createdAt) || byText(a.id, b.id);
}

export const sortTasksForList = (rows: TaskRow[]): TaskRow[] =>
  [...rows].sort((a, b) => compareDateThenCreation({ ...a, date: a.workDate }, { ...b, date: b.workDate }));

export const sortMilestones = (rows: MilestoneRow[]): MilestoneRow[] =>
  [...rows].sort((a, b) => compareDateThenCreation({ ...a, date: a.dueDate }, { ...b, date: b.dueDate }));

export const sortReadings = (rows: ReadingRow[]): ReadingRow[] =>
  [...rows].sort((a, b) => byText(b.readOn, a.readOn) || byText(b.createdAt, a.createdAt) || byText(b.id, a.id));

/** Prochaine action : la tâche ouverte la plus proche ; les tâches sans date viennent après. */
export function pickNextAction(tasks: TaskRow[]): TaskRow | null {
  const open = tasks.filter((t) => t.status === 'TODO');
  open.sort((a, b) => compareDateThenCreation({ ...a, date: a.workDate }, { ...b, date: b.workDate }));
  return open[0] ?? null;
}

export interface GoalRelations {
  milestones: MilestoneRow[];
  readings: ReadingRow[];
  tasks: TaskRow[];
}

function progressOf(g: GoalRow, rel: GoalRelations) {
  return goalProgress({
    progressMode: g.progressMode,
    measureUnit: g.measureUnit,
    startValue: g.startValue,
    targetValue: g.targetValue,
    milestones: rel.milestones.map((m) => ({ completedAt: m.completedAt ? new Date(m.completedAt) : null })),
    readings: rel.readings.map((r) => ({ value: r.value, readOn: new Date(`${r.readOn}T00:00:00.000Z`), createdAt: new Date(r.createdAt) })),
  });
}

export function serializeGoal(g: GoalRow, rel: GoalRelations, today: string) {
  const next = pickNextAction(rel.tasks);
  const isActive = (ACTIVE_GOAL_STATUSES as readonly string[]).includes(g.status);
  return {
    id: g.id,
    title: g.title,
    description: g.description,
    motivation: g.motivation,
    category: g.category,
    horizon: g.horizon,
    startDate: g.startDate,
    endDate: g.endDate,
    priority: g.priority,
    status: g.status,
    progressMode: g.progressMode,
    measureUnit: g.measureUnit,
    startValue: g.startValue,
    targetValue: g.targetValue,
    progress: progressOf(g, rel),
    nextAction: next ? serializeTask(next, today) : null,
    // Invite à planifier quand un objectif actif n'a plus rien de prévu.
    needsNextAction: isActive && next === null,
    createdAt: g.createdAt,
    updatedAt: g.updatedAt,
  };
}

export function serializeGoalDetail(g: GoalRow, rel: GoalRelations, today: string) {
  return {
    ...serializeGoal(g, rel, today),
    milestones: sortMilestones(rel.milestones).map(serializeMilestone),
    readings: sortReadings(rel.readings).map(serializeReading),
    tasks: sortTasksForList(rel.tasks).map((t) => serializeTask(t, today)),
  };
}

export interface TodayLists {
  planned: TaskRow[];
  done: TaskRow[];
  toReschedule: TaskRow[];
  overdue: TaskRow[];
  goalsWithoutNextAction: { id: string; title: string }[];
}

/** Vue « Aujourd'hui ». `events` vient d'ailleurs (serveur : base ; téléphone : à venir en phase 2). */
export function buildToday(date: string, l: TodayLists, events: unknown[]) {
  const s = (t: TaskRow) => serializeTask(t, date);
  return {
    date,
    events,
    planned: l.planned.map(s),
    done: l.done.map(s),
    toReschedule: l.toReschedule.map(s),
    overdue: l.overdue.map(s),
    goalsWithoutNextAction: l.goalsWithoutNextAction,
    emptyMessage: l.planned.length === 0 && l.done.length === 0 ? 'Aucune action prévue' : null,
  };
}

/** Bilan d'une période. `events` : résumé des rendez-vous, fourni par l'appelant. */
export function buildReview(
  timezone: string,
  from: string,
  to: string,
  tasks: TaskRow[],
  goals: { goal: GoalRow; rel: GoalRelations }[],
  events: unknown,
) {
  const taskReview = reviewTasks(
    tasks.map((t) => ({
      status: t.status,
      workDate: t.workDate,
      originalDate: t.originalDate,
      createdDate: todayIn(timezone, new Date(t.createdAt)),
    })),
    from,
    to,
  );
  return {
    from,
    to,
    tasks: taskReview,
    events,
    goals: goals.map(({ goal, rel }) => {
      // Jalons terminés pendant la période, d'après le jour local de réalisation.
      const milestonesDoneInPeriod = rel.milestones.filter((m) => {
        if (!m.completedAt) return false;
        const day = todayIn(timezone, new Date(m.completedAt));
        return day >= from && day <= to;
      }).length;
      return { id: goal.id, title: goal.title, progress: progressOf(goal, rel), milestonesDoneInPeriod };
    }),
    questions: ["Qu'ai-je accompli ?", "Qu'est-ce qui m'a bloqué ?", 'Quelle est ma prochaine priorité ?'],
  };
}
