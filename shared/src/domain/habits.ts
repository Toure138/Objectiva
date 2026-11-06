import { addDays } from '../dates';
import { DomainError, notFound, parseInput, validationError } from '../errors';
import {
  bestStreak,
  currentStreak,
  habitGrid,
  isExpected,
  isPaused,
  mondayOf,
  ruleOn,
  successRate,
  weekDone,
  weekTarget,
  type HabitRule,
} from '../habits.rules';
import { createHabitSchema, habitDayBody, listHabitsQuery, updateHabitSchema } from '../habits.schemas';
import { occurrenceId } from '../recurrence.rules';
import type { Ctx, Repo } from './repo';
import { newId } from './repo';
import type { HabitCheckRow, HabitRow } from './rows';
import { resolveTaskLinks } from './tasks';

// Habitudes (spec 012) : une seule implémentation pour le serveur et le téléphone.
// Un jour coché est une ligne à identifiant calculé (habitude + jour) : deux appareils hors ligne qui cochent
// le même jour écrivent la même ligne ; décocher remet `done` à faux (jamais de suppression).

/** Jours faits de chaque habitude. */
async function doneDays(repo: Repo, habits: HabitRow[]): Promise<Map<string, Set<string>>> {
  const out = new Map(habits.map((h) => [h.id, new Set<string>()]));
  if (habits.length === 0) return out;
  for (const c of await repo.habitChecks.byHabits(habits.map((h) => h.id))) {
    if (c.done) out.get(c.habitId)?.add(c.date);
  }
  return out;
}

/** Règle affichée : celle d'aujourd'hui, ou la première si l'habitude commence plus tard. */
const displayedRule = (h: HabitRow, today: string): HabitRule => ruleOn(h, today) ?? h.rules[0]!;

export function serializeHabit(h: HabitRow, done: ReadonlySet<string>, today: string) {
  const rule = displayedRule(h, today);
  const monday = mondayOf(today);
  return {
    id: h.id,
    title: h.title,
    goalId: h.goalId,
    status: h.status,
    startDate: h.startDate,
    kind: rule.kind,
    weekdays: rule.weekdays,
    timesPerWeek: rule.timesPerWeek,
    rules: h.rules,
    pauses: h.pauses,
    paused: isPaused(h, today),
    doneToday: done.has(today),
    streak: currentStreak(h, done, today),
    bestStreak: bestStreak(h, done, today),
    week: rule.kind === 'SEMAINE' ? { done: weekDone(monday, done, today), target: weekTarget(h, monday) } : null,
    last30: successRate(h, done, addDays(today, -29), today, today),
    createdAt: h.createdAt,
    updatedAt: h.updatedAt,
  };
}
export type HabitView = ReturnType<typeof serializeHabit>;

async function requireHabit(repo: Repo, id: string): Promise<HabitRow> {
  const h = await repo.habits.get(id);
  if (!h) throw notFound('Habitude');
  return h;
}

async function view(repo: Repo, ctx: Ctx, h: HabitRow): Promise<HabitView> {
  return serializeHabit(h, (await doneDays(repo, [h])).get(h.id)!, ctx.today);
}

function ruleFrom(input: { kind: 'JOURS' | 'SEMAINE'; weekdays?: number[]; timesPerWeek?: number }, from: string): HabitRule {
  return input.kind === 'JOURS'
    ? { from, kind: 'JOURS', weekdays: input.weekdays!, timesPerWeek: null }
    : { from, kind: 'SEMAINE', weekdays: [], timesPerWeek: input.timesPerWeek! };
}

// ---------------------------------------------------------------------------------------------
// Lecture

/** Actives d'abord, puis archivées ; dans chaque groupe, par date de création. */
export async function listHabits(repo: Repo, ctx: Ctx, rawQuery: unknown) {
  const q = parseInput(listHabitsQuery, rawQuery);
  const habits = (await repo.habits.list()).filter((h) => !q.status || h.status === q.status);
  const done = await doneDays(repo, habits);
  return habits
    .map((h) => serializeHabit(h, done.get(h.id)!, ctx.today))
    .sort((a, b) => Number(a.status === 'ARCHIVEE') - Number(b.status === 'ARCHIVEE'));
}

/** Fiche : la vue et la grille des 5 dernières semaines. */
export async function getHabit(repo: Repo, ctx: Ctx, id: string) {
  const h = await requireHabit(repo, id);
  const done = (await doneDays(repo, [h])).get(h.id)!;
  return { ...serializeHabit(h, done, ctx.today), grid: habitGrid(h, done, ctx.today) };
}

/**
 * Habitudes du jour (« Aujourd'hui ») : actives et hors pause, prévues ce jour-là (jours fixes) ou dont
 * l'objectif de la semaine n'est pas encore atteint (« par semaine »), ainsi que celles déjà cochées.
 */
export async function habitsOfDay(repo: Repo, date: string) {
  const habits = (await repo.habits.list()).filter((h) => h.status === 'ACTIVE' && ruleOn(h, date) && !isPaused(h, date));
  const done = await doneDays(repo, habits);
  const out = [];
  for (const h of habits) {
    const days = done.get(h.id)!;
    const rule = ruleOn(h, date)!;
    const doneToday = days.has(date);
    const monday = mondayOf(date);
    const week = rule.kind === 'SEMAINE' ? { done: weekDone(monday, days, date), target: weekTarget(h, monday) } : null;
    const due = rule.kind === 'JOURS' ? isExpected(h, date) : week!.done < week!.target;
    if (!due && !doneToday) continue;
    out.push({ id: h.id, title: h.title, goalId: h.goalId, kind: rule.kind, done: doneToday, streak: currentStreak(h, days, date), week });
  }
  return out;
}

/** Réussite de chaque habitude sur la période du bilan (celles qui avaient quelque chose d'attendu). */
export async function habitsSummary(repo: Repo, ctx: Ctx, from: string, to: string) {
  const habits = (await repo.habits.list()).filter((h) => h.startDate <= to);
  const done = await doneDays(repo, habits);
  return habits
    .map((h) => ({ id: h.id, title: h.title, ...successRate(h, done.get(h.id)!, from, to, ctx.today) }))
    .filter((s) => s.expected > 0);
}

// ---------------------------------------------------------------------------------------------
// Écriture

export async function createHabit(repo: Repo, ctx: Ctx, raw: unknown) {
  const input = parseInput(createHabitSchema, raw);
  const links = await resolveTaskLinks(repo, input.goalId, null);
  const startDate = input.startDate ?? ctx.today;
  const row: HabitRow = {
    id: input.id ?? newId(),
    goalId: links.goalId,
    title: input.title,
    rules: [ruleFrom(input, startDate)],
    pauses: [],
    status: 'ACTIVE',
    startDate,
    createdAt: ctx.now,
    updatedAt: ctx.now,
  };
  await repo.habits.insert(row);
  return serializeHabit(row, new Set(), ctx.today);
}

/**
 * Titre et objectif : modifiés tels quels. Fréquence : nouvelle règle à partir de `from` (aujourd'hui par défaut,
 * jamais avant le début) ; les règles plus tardives sont remplacées, les jours précédents ne changent pas.
 */
export async function updateHabit(repo: Repo, ctx: Ctx, id: string, raw: unknown) {
  const input = parseInput(updateHabitSchema, raw);
  const h = await requireHabit(repo, id);
  const patch: Partial<HabitRow> = { updatedAt: ctx.now };
  if (input.title !== undefined) patch.title = input.title;
  if (input.goalId !== undefined) patch.goalId = (await resolveTaskLinks(repo, input.goalId, null)).goalId;
  if (input.kind !== undefined) {
    const from = input.from ?? (ctx.today > h.startDate ? ctx.today : h.startDate);
    if (from < h.startDate) {
      throw validationError([{ field: 'from', message: 'La nouvelle fréquence ne peut pas commencer avant l’habitude' }]);
    }
    patch.rules = [...h.rules.filter((r) => r.from < from), ruleFrom({ ...input, kind: input.kind }, from)];
  }
  return view(repo, ctx, await repo.habits.update(id, patch));
}

/** En pause à partir de `from` (aujourd'hui par défaut). Déjà en pause : rien ne change. */
export async function pauseHabit(repo: Repo, ctx: Ctx, id: string, raw: unknown) {
  const { date } = parseInput(habitDayBody, raw ?? {});
  const h = await requireHabit(repo, id);
  if (h.pauses.some((p) => p.to === null)) return view(repo, ctx, h);
  const from = date ?? ctx.today;
  const pauses = [...h.pauses, { from: from < h.startDate ? h.startDate : from, to: null }];
  return view(repo, ctx, await repo.habits.update(id, { pauses, updatedAt: ctx.now }));
}

/** Reprise aujourd'hui : la pause en cours s'arrête hier (supprimée si elle commençait aujourd'hui). */
export async function resumeHabit(repo: Repo, ctx: Ctx, id: string) {
  const h = await requireHabit(repo, id);
  if (!h.pauses.some((p) => p.to === null)) return view(repo, ctx, h);
  const yesterday = addDays(ctx.today, -1);
  const pauses = h.pauses
    .map((p) => (p.to === null ? { from: p.from, to: yesterday } : p))
    .filter((p) => p.to === null || p.to >= p.from);
  return view(repo, ctx, await repo.habits.update(id, { pauses, updatedAt: ctx.now }));
}

export async function setHabitStatus(repo: Repo, ctx: Ctx, id: string, status: 'ACTIVE' | 'ARCHIVEE') {
  const h = await requireHabit(repo, id);
  if (h.status === status) return view(repo, ctx, h);
  return view(repo, ctx, await repo.habits.update(id, { status, updatedAt: ctx.now }));
}

export async function deleteHabit(repo: Repo, id: string): Promise<void> {
  await requireHabit(repo, id);
  await repo.habits.remove(id);
}

/** Coche (ou décoche) un jour : aujourd'hui par défaut, jamais dans le futur ni avant le début. Idempotent. */
export async function setHabitDay(repo: Repo, ctx: Ctx, id: string, raw: unknown, done: boolean) {
  const { date: asked } = parseInput(habitDayBody, raw ?? {});
  const h = await requireHabit(repo, id);
  const date = asked ?? ctx.today;
  if (date > ctx.today) throw validationError([{ field: 'date', message: 'Tu ne peux pas cocher un jour à venir' }]);
  if (date < h.startDate) throw validationError([{ field: 'date', message: 'Ce jour précède le début de l’habitude' }]);
  const checkId = occurrenceId(h.id, date);
  const existing = await repo.habitChecks.get(checkId);
  if (existing) {
    if (existing.done !== done) await repo.habitChecks.update(checkId, { done, updatedAt: ctx.now });
  } else if (done) {
    const row: HabitCheckRow = { id: checkId, habitId: h.id, date, done: true, createdAt: ctx.now, updatedAt: ctx.now };
    try {
      await repo.habitChecks.insert(row);
    } catch (e) {
      // Écrit entre-temps (double appui sur le serveur) : c'est la même ligne, déjà cochée.
      if (!(e instanceof DomainError && e.status === 409) && !(await repo.habitChecks.get(checkId))) throw e;
    }
  }
  return view(repo, ctx, h);
}
