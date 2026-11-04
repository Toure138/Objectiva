import { conflict, notFound, parseInput, validationError } from '../errors';
import { createTaskSchema, listTasksQuery, rescheduleSchema, updateTaskSchema } from '../tasks.schemas';
import { applyWorkDateChange } from '../tasks.rules';
import type { Ctx, Repo } from './repo';
import { newId } from './repo';
import type { TaskRow } from './rows';
import { serializeTask } from './views';

// Commandes sur les tâches : une seule implémentation, branchée sur Prisma (serveur) ou
// IndexedDB (téléphone) par l'interface `Repo`. Elles valident elles-mêmes leurs entrées.

async function requireTask(repo: Repo, id: string): Promise<TaskRow> {
  const t = await repo.tasks.get(id);
  if (!t) throw notFound('Tâche');
  return t;
}

/**
 * Vérifie que l'objectif et le jalon visés existent (pour cet utilisateur) et sont cohérents.
 * Un jalon seul suffit : l'objectif est déduit du jalon.
 */
export async function resolveTaskLinks(
  repo: Repo,
  goalId: string | null | undefined,
  milestoneId: string | null | undefined,
): Promise<{ goalId: string | null; milestoneId: string | null }> {
  let resolvedGoal = goalId ?? null;
  if (milestoneId) {
    const m = await repo.milestones.get(milestoneId);
    if (!m) throw notFound('Jalon');
    if (resolvedGoal && resolvedGoal !== m.goalId) {
      throw validationError([{ field: 'milestoneId', message: "Ce jalon n'appartient pas à l'objectif choisi" }]);
    }
    resolvedGoal = m.goalId;
  }
  if (resolvedGoal && !(await repo.goals.get(resolvedGoal))) throw notFound('Objectif');
  return { goalId: resolvedGoal, milestoneId: milestoneId ?? null };
}

export async function createTask(repo: Repo, ctx: Ctx, raw: unknown) {
  const input = parseInput(createTaskSchema, raw);
  const links = await resolveTaskLinks(repo, input.goalId, input.milestoneId);
  const workDate = input.workDate ?? null;
  const row: TaskRow = {
    id: input.id ?? newId(),
    ...links,
    eventId: null,
    eventRole: null,
    title: input.title,
    notes: input.notes ?? null,
    workDate,
    dueDate: input.dueDate ?? null,
    status: 'TODO',
    completedAt: null,
    originalDate: workDate,
    rescheduleCount: 0,
    createdAt: ctx.now,
    updatedAt: ctx.now,
  };
  await repo.tasks.insert(row);
  return serializeTask(row, ctx.today);
}

export async function listTasks(repo: Repo, ctx: Ctx, rawQuery: unknown) {
  const q = parseInput(listTasksQuery, rawQuery);
  const { items, total } = await repo.tasks.list({
    status: q.status,
    goalId: q.goalId,
    from: q.from,
    to: q.to,
    unscheduled: q.unscheduled,
    limit: q.limit,
    offset: q.offset,
  });
  return { items: items.map((t) => serializeTask(t, ctx.today)), total, limit: q.limit, offset: q.offset };
}

export async function getTask(repo: Repo, ctx: Ctx, id: string) {
  return serializeTask(await requireTask(repo, id), ctx.today);
}

/** Effet d'un changement de date de travail sur la ligne (première date, nombre de reports). */
function workDatePatch(existing: TaskRow, next: string | null): Partial<TaskRow> {
  const r = applyWorkDateChange(
    { workDate: existing.workDate, originalDate: existing.originalDate, rescheduleCount: existing.rescheduleCount },
    next,
  );
  if (!r.changed) return {};
  return { workDate: r.workDate, originalDate: r.originalDate, rescheduleCount: r.rescheduleCount };
}

export async function updateTask(repo: Repo, ctx: Ctx, id: string, raw: unknown) {
  const input = parseInput(updateTaskSchema, raw);
  const existing = await requireTask(repo, id);
  const patch: Partial<TaskRow> = {};
  if (input.title !== undefined) patch.title = input.title;
  if (input.notes !== undefined) patch.notes = input.notes;
  if (input.dueDate !== undefined) patch.dueDate = input.dueDate ? input.dueDate : null;

  if (input.goalId !== undefined || input.milestoneId !== undefined) {
    // Changer d'objectif sans préciser le jalon détache l'ancien jalon (il appartient à l'ancien objectif).
    const goalId = input.goalId !== undefined ? input.goalId : existing.goalId;
    const milestoneId = input.milestoneId !== undefined ? input.milestoneId : input.goalId !== undefined ? null : existing.milestoneId;
    Object.assign(patch, await resolveTaskLinks(repo, goalId, milestoneId));
  }
  if (input.workDate !== undefined) Object.assign(patch, workDatePatch(existing, input.workDate));

  const task = await repo.tasks.update(id, { ...patch, updatedAt: ctx.now });
  return serializeTask(task, ctx.today);
}

export async function completeTask(repo: Repo, ctx: Ctx, id: string) {
  const existing = await requireTask(repo, id);
  // Idempotent : un double appui ne change pas la date de réalisation déjà enregistrée.
  if (existing.status === 'DONE') return serializeTask(existing, ctx.today);
  const task = await repo.tasks.update(id, { status: 'DONE', completedAt: ctx.now, updatedAt: ctx.now });
  return serializeTask(task, ctx.today);
}

/** Annule une validation ou une annulation par erreur : la tâche redevient « à faire ». */
export async function reopenTask(repo: Repo, ctx: Ctx, id: string) {
  const existing = await requireTask(repo, id);
  if (existing.status === 'TODO') return serializeTask(existing, ctx.today);
  const task = await repo.tasks.update(id, { status: 'TODO', completedAt: null, updatedAt: ctx.now });
  return serializeTask(task, ctx.today);
}

export async function rescheduleTask(repo: Repo, ctx: Ctx, id: string, raw: unknown) {
  const input = parseInput(rescheduleSchema, raw);
  const existing = await requireTask(repo, id);
  if (existing.status !== 'TODO') throw conflict('Seule une tâche à faire peut être reportée');
  const task = await repo.tasks.update(id, { ...workDatePatch(existing, input.workDate), updatedAt: ctx.now });
  return serializeTask(task, ctx.today);
}

export async function cancelTask(repo: Repo, ctx: Ctx, id: string) {
  const existing = await requireTask(repo, id);
  if (existing.status === 'CANCELLED') return serializeTask(existing, ctx.today);
  const task = await repo.tasks.update(id, { status: 'CANCELLED', completedAt: null, updatedAt: ctx.now });
  return serializeTask(task, ctx.today);
}

export async function deleteTask(repo: Repo, id: string): Promise<void> {
  await requireTask(repo, id);
  await repo.tasks.remove(id);
}
