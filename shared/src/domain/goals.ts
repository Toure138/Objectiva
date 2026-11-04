import { conflict, notFound, parseInput, validationError } from '../errors';
import {
  createGoalSchema,
  createMilestoneSchema,
  createReadingSchema,
  listGoalsQuery,
  measureProblems,
  updateGoalSchema,
  updateMilestoneSchema,
} from '../goals.schemas';
import type { Ctx, Repo } from './repo';
import { newId } from './repo';
import type { GoalRow, MilestoneRow, ReadingRow } from './rows';
import type { GoalRelations } from './views';
import { serializeGoal, serializeGoalDetail, serializeMilestone, serializeReading } from './views';

// Commandes sur les objectifs, jalons et relevés (voir tasks.ts).

async function requireGoal(repo: Repo, id: string): Promise<GoalRow> {
  const g = await repo.goals.get(id);
  if (!g) throw notFound('Objectif');
  return g;
}

/** Jalons, relevés et tâches de plusieurs objectifs, regroupés par objectif. */
export async function loadRelations(repo: Repo, goalIds: string[]): Promise<Map<string, GoalRelations>> {
  const out = new Map<string, GoalRelations>(goalIds.map((id) => [id, { milestones: [], readings: [], tasks: [] }]));
  if (goalIds.length === 0) return out;
  const [milestones, readings, tasks] = await Promise.all([
    repo.milestones.listByGoals(goalIds),
    repo.readings.listByGoals(goalIds),
    repo.tasks.listByGoals(goalIds),
  ]);
  for (const m of milestones) out.get(m.goalId)?.milestones.push(m);
  for (const r of readings) out.get(r.goalId)?.readings.push(r);
  for (const t of tasks) if (t.goalId) out.get(t.goalId)?.tasks.push(t);
  return out;
}

async function goalView(repo: Repo, ctx: Ctx, goal: GoalRow) {
  const rel = (await loadRelations(repo, [goal.id])).get(goal.id)!;
  return serializeGoal(goal, rel, ctx.today);
}

export async function listGoals(repo: Repo, ctx: Ctx, rawQuery: unknown) {
  const q = parseInput(listGoalsQuery, rawQuery);
  const goals = await repo.goals.list({ status: q.status, category: q.category });
  const rel = await loadRelations(repo, goals.map((g) => g.id));
  return goals.map((g) => serializeGoal(g, rel.get(g.id)!, ctx.today));
}

export async function getGoal(repo: Repo, ctx: Ctx, id: string) {
  const goal = await requireGoal(repo, id);
  const rel = (await loadRelations(repo, [id])).get(id)!;
  return serializeGoalDetail(goal, rel, ctx.today);
}

export async function createGoal(repo: Repo, ctx: Ctx, raw: unknown) {
  const input = parseInput(createGoalSchema, raw);
  const row: GoalRow = {
    id: input.id ?? newId(),
    title: input.title,
    description: input.description ?? null,
    motivation: input.motivation ?? null,
    category: input.category,
    horizon: input.horizon ?? 'PERSONNALISEE',
    startDate: input.startDate,
    endDate: input.endDate,
    priority: input.priority ?? 'MOYENNE',
    status: input.status ?? 'A_DEMARRER',
    progressMode: input.progressMode ?? 'JALONS',
    measureUnit: input.measureUnit ?? null,
    startValue: input.startValue ?? null,
    targetValue: input.targetValue ?? null,
    createdAt: ctx.now,
    updatedAt: ctx.now,
  };
  await repo.goals.insert(row);
  return goalView(repo, ctx, row);
}

export async function updateGoal(repo: Repo, ctx: Ctx, id: string, raw: unknown) {
  const input = parseInput(updateGoalSchema, raw);
  const existing = await requireGoal(repo, id);
  const start = input.startDate ?? existing.startDate;
  const end = input.endDate ?? existing.endDate;
  if (end < start) throw validationError([{ field: 'endDate', message: "L'échéance doit suivre la date de début" }]);
  // Le mode mesuré se valide sur les valeurs finales (celles du corps + celles déjà enregistrées).
  const problems = measureProblems({
    progressMode: input.progressMode ?? existing.progressMode,
    measureUnit: input.measureUnit === undefined ? existing.measureUnit : input.measureUnit,
    startValue: input.startValue === undefined ? existing.startValue : input.startValue,
    targetValue: input.targetValue === undefined ? existing.targetValue : input.targetValue,
  });
  if (problems.length > 0) throw validationError(problems);

  const patch: Partial<GoalRow> = { updatedAt: ctx.now };
  for (const key of [
    'title',
    'description',
    'motivation',
    'category',
    'horizon',
    'startDate',
    'endDate',
    'priority',
    'status',
    'progressMode',
    'measureUnit',
    'startValue',
    'targetValue',
  ] as const) {
    if (input[key] !== undefined) (patch as Record<string, unknown>)[key] = input[key];
  }
  return goalView(repo, ctx, await repo.goals.update(id, patch));
}

export async function deleteGoal(repo: Repo, id: string): Promise<void> {
  await requireGoal(repo, id);
  // Les tâches liées sont conservées (sans objectif) : le travail fait reste.
  await repo.goals.remove(id);
}

export async function createMilestone(repo: Repo, ctx: Ctx, goalId: string, raw: unknown) {
  const input = parseInput(createMilestoneSchema, raw);
  await requireGoal(repo, goalId);
  const row: MilestoneRow = {
    id: input.id ?? newId(),
    goalId,
    title: input.title,
    dueDate: input.dueDate ?? null,
    completedAt: null,
    createdAt: ctx.now,
    updatedAt: ctx.now,
  };
  await repo.milestones.insert(row);
  return serializeMilestone(row);
}

export async function updateMilestone(repo: Repo, ctx: Ctx, id: string, raw: unknown) {
  const input = parseInput(updateMilestoneSchema, raw);
  const existing = await repo.milestones.get(id);
  if (!existing) throw notFound('Jalon');
  const patch: Partial<MilestoneRow> = { updatedAt: ctx.now };
  if (input.title !== undefined) patch.title = input.title;
  if (input.dueDate !== undefined) patch.dueDate = input.dueDate ? input.dueDate : null;
  if (input.completed === true) patch.completedAt = existing.completedAt ?? ctx.now;
  else if (input.completed === false) patch.completedAt = null;
  return serializeMilestone(await repo.milestones.update(id, patch));
}

export async function deleteMilestone(repo: Repo, id: string): Promise<void> {
  if (!(await repo.milestones.get(id))) throw notFound('Jalon');
  await repo.milestones.remove(id);
}

export async function createReading(repo: Repo, ctx: Ctx, goalId: string, raw: unknown) {
  const input = parseInput(createReadingSchema, raw);
  const goal = await requireGoal(repo, goalId);
  if (goal.progressMode !== 'MESURE') {
    throw conflict("Cet objectif n'est pas suivi par une mesure : passe-le en progression mesurée d'abord");
  }
  const row: ReadingRow = {
    id: input.id ?? newId(),
    goalId,
    value: input.value,
    readOn: input.readOn ?? ctx.today,
    note: input.note ?? null,
    createdAt: ctx.now,
    updatedAt: ctx.now,
  };
  await repo.readings.insert(row);
  return { reading: serializeReading(row), progress: (await goalView(repo, ctx, goal)).progress };
}

export async function deleteReading(repo: Repo, ctx: Ctx, id: string) {
  const reading = await repo.readings.get(id);
  if (!reading) throw notFound('Relevé');
  await repo.readings.remove(id);
  return { progress: (await goalView(repo, ctx, await requireGoal(repo, reading.goalId))).progress };
}
