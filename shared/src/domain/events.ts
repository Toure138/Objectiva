import { gridHours, layoutDay, type AgendaSlot } from '../agenda.rules';
import { addDays } from '../dates';
import { DomainError, conflict, notFound, parseInput, validationError } from '../errors';
import { blockedWindow, defaultTaskDate, localDaysToUtc, localToUtc, summarizeEvents, utcToLocal } from '../events.rules';
import {
  agendaQuery,
  completeEventSchema,
  createEventSchema,
  createEventTaskSchema,
  listEventsQuery,
  scopeQuery,
  updateEventSchema,
} from '../events.schemas';
import { firstDateFrom, generationHorizon, isoWeekday, MAX_HORIZON_DAYS, occurrenceId, seriesDates } from '../recurrence.rules';
import type { Ctx, Repo } from './repo';
import { newId } from './repo';
import type { EventRow, SeriesRow, TaskRow } from './rows';
import { resolveTaskLinks } from './tasks';
import { serializeTask } from './views';

// Rendez-vous et réunions récurrentes (specs 004 et 009) : une seule implémentation pour le serveur et
// le téléphone. Une série décrit un modèle et des jours ; ses occurrences sont des rendez-vous ordinaires,
// créés d'avance avec un identifiant calculé (aucun doublon quand deux appareils les créent hors ligne).

// ---------------------------------------------------------------------------------------------
// Vues

const local = (instant: string, timezone: string) => utcToLocal(new Date(instant), timezone);

export function serializeEvent(e: EventRow, timezone: string, series: SeriesRow | null = null) {
  const start = local(e.startsAt, timezone);
  const end = local(e.endsAt, timezone);
  const blocked = blockedWindow(new Date(e.startsAt), e.travelBeforeMinutes, e.prepBeforeMinutes, timezone);
  return {
    id: e.id,
    type: e.type,
    title: e.title,
    date: start.date,
    startTime: start.time,
    endTime: end.time,
    startsAt: e.startsAt,
    endsAt: e.endsAt,
    location: e.location,
    link: e.link,
    participants: e.participants,
    agenda: e.agenda,
    decisions: e.decisions,
    status: e.status,
    goalId: e.goalId,
    milestoneId: e.milestoneId,
    // Temps réservé avant le rendez-vous : déplacement puis préparation.
    travelBeforeMinutes: e.travelBeforeMinutes,
    prepBeforeMinutes: e.prepBeforeMinutes,
    reminder: e.reminder,
    blockedMinutes: blocked.blockedMinutes,
    blockedFrom: blocked.blockedFrom.toISOString(),
    blockedFromTime: blocked.blockedFromTime,
    leaveAtTime: blocked.leaveAtTime,
    completedAt: e.completedAt,
    createdAt: e.createdAt,
    updatedAt: e.updatedAt,
    // Réunion récurrente : série, date d'origine de l'occurrence et règle de répétition.
    seriesId: e.seriesId,
    occurrenceDate: e.occurrenceDate,
    repeat: series ? { weekdays: series.weekdays, startDate: series.startDate, until: series.until } : null,
  };
}
export type EventView = ReturnType<typeof serializeEvent>;

async function seriesMap(repo: Repo): Promise<Map<string, SeriesRow>> {
  return new Map((await repo.series.list()).map((s) => [s.id, s]));
}

async function serializeAll(repo: Repo, ctx: Ctx, rows: EventRow[]): Promise<EventView[]> {
  const series = rows.some((e) => e.seriesId) ? await seriesMap(repo) : new Map<string, SeriesRow>();
  return rows.map((e) => serializeEvent(e, ctx.timezone, e.seriesId ? (series.get(e.seriesId) ?? null) : null));
}

// ---------------------------------------------------------------------------------------------
// Occurrences créées d'avance

function occurrenceRow(s: SeriesRow, date: string, ctx: Ctx): EventRow {
  return {
    id: occurrenceId(s.id, date),
    seriesId: s.id,
    occurrenceDate: date,
    goalId: s.goalId,
    milestoneId: s.milestoneId,
    type: s.type,
    title: s.title,
    startsAt: localToUtc(date, s.startTime, ctx.timezone).toISOString(),
    endsAt: localToUtc(date, s.endTime, ctx.timezone).toISOString(),
    location: s.location,
    link: s.link,
    participants: [...s.participants],
    agenda: s.agenda,
    decisions: null,
    status: 'PREVU',
    travelBeforeMinutes: s.travelBeforeMinutes,
    prepBeforeMinutes: s.prepBeforeMinutes,
    reminder: s.reminder,
    completedAt: null,
    createdAt: ctx.now,
    updatedAt: ctx.now,
  };
}

/**
 * Crée les occurrences manquantes de chaque série jusqu'à l'horizon (60 jours, ou `through` s'il est plus
 * loin, sans dépasser un an). Idempotent : une occurrence existante (même déplacée, annulée ou réalisée)
 * n'est jamais recréée ni modifiée.
 */
export async function ensureOccurrences(repo: Repo, ctx: Ctx, through?: string, only?: SeriesRow[]): Promise<void> {
  const horizon = generationHorizon(ctx.today, through);
  for (const s of only ?? (await repo.series.list())) {
    const dates = seriesDates(s, s.startDate, horizon);
    if (dates.length === 0) continue;
    const have = new Set((await repo.events.bySeries(s.id)).map((e) => e.occurrenceDate));
    for (const date of dates) {
      if (!have.has(date)) await repo.events.insertIfAbsent(occurrenceRow(s, date, ctx));
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Lecture

async function requireEvent(repo: Repo, id: string): Promise<EventRow> {
  const e = await repo.events.get(id);
  if (!e) throw notFound('Événement');
  return e;
}

async function requireSeries(repo: Repo, id: string): Promise<SeriesRow> {
  const s = await repo.series.get(id);
  if (!s) throw notFound('Série');
  return s;
}

export async function listEvents(repo: Repo, ctx: Ctx, rawQuery: unknown) {
  const q = parseInput(listEventsQuery, rawQuery);
  await ensureOccurrences(repo, ctx, q.to);
  const bounds = q.from || q.to ? localDaysToUtc(q.from ?? q.to!, q.to ?? q.from!, ctx.timezone) : null;
  const rows = await repo.events.list({
    startFrom: q.from ? bounds!.start.toISOString() : undefined,
    startBefore: q.to ? bounds!.end.toISOString() : undefined,
    status: q.status,
    limit: q.limit,
  });
  return serializeAll(repo, ctx, rows);
}

export async function getEvent(repo: Repo, ctx: Ctx, id: string) {
  const e = await requireEvent(repo, id);
  const series = e.seriesId ? await repo.series.get(e.seriesId) : null;
  const tasks = await repo.tasks.byEvent(id);
  return { ...serializeEvent(e, ctx.timezone, series), tasks: tasks.map((t) => serializeTask(t, ctx.today)) };
}

/** Rendez-vous non annulés d'un jour local, par heure (vue « Aujourd'hui »). */
export async function eventsOfDay(repo: Repo, ctx: Ctx, date: string): Promise<EventView[]> {
  await ensureOccurrences(repo, ctx, date);
  const { start, end } = localDaysToUtc(date, date, ctx.timezone);
  const rows = await repo.events.list({ startFrom: start.toISOString(), startBefore: end.toISOString(), notStatus: 'ANNULE' });
  return serializeAll(repo, ctx, rows);
}

/** Résumé des rendez-vous d'une plage de jours locaux (bilan). */
export async function eventsSummary(repo: Repo, ctx: Ctx, from: string, to: string) {
  await ensureOccurrences(repo, ctx, to);
  const { start, end } = localDaysToUtc(from, to, ctx.timezone);
  return summarizeEvents(await repo.events.list({ startFrom: start.toISOString(), startBefore: end.toISOString() }));
}

const minutesOf = (time: string): number => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));

/**
 * Agenda d'un jour : rendez-vous non annulés placés sur une grille horaire. Chacun reçoit sa colonne,
 * le nombre de colonnes de son groupe et ses conflits (horaires qui se croisent, ou trajet / préparation
 * qui empiète sur un autre rendez-vous).
 */
export async function getAgenda(repo: Repo, ctx: Ctx, rawQuery: unknown) {
  const { date: asked } = parseInput(agendaQuery, rawQuery);
  const date = asked ?? ctx.today;
  const events = await eventsOfDay(repo, ctx, date);
  const slots: AgendaSlot[] = events.map((e) => {
    const start = minutesOf(e.startTime);
    return { id: e.id, start, end: minutesOf(e.endTime), blockedStart: start - e.blockedMinutes };
  });
  const placement = layoutDay(slots);
  const titles = new Map(events.map((e) => [e.id, e.title]));
  const items = events.map((e) => {
    const p = placement.get(e.id)!;
    return {
      ...e,
      column: p.column,
      columns: p.columns,
      conflicts: p.conflicts.map((c) => ({ ...c, withTitle: titles.get(c.withId)! })),
    };
  });
  return {
    date,
    ...gridHours(slots),
    events: items,
    conflictCount: items.filter((e) => e.conflicts.length > 0).length,
  };
}

// ---------------------------------------------------------------------------------------------
// Création

const endBeforeStart = () =>
  new DomainError(400, 'VALIDATION_ERROR', "L'heure de fin doit suivre l'heure de début", [
    { field: 'endTime', message: "L'heure de fin doit suivre l'heure de début" },
  ]);

const noDateLeft = () =>
  validationError([{ field: 'repeat.weekdays', message: 'Aucun de ces jours ne tombe avant la fin de la répétition' }]);

export async function createEvent(repo: Repo, ctx: Ctx, raw: unknown) {
  const input = parseInput(createEventSchema, raw);
  const links = await resolveTaskLinks(repo, input.goalId, input.milestoneId);
  const template = {
    ...links,
    type: input.type,
    title: input.title,
    location: input.location ?? null,
    link: input.link ?? null,
    participants: input.participants ?? [],
    agenda: input.agenda ?? null,
    travelBeforeMinutes: input.travelBeforeMinutes ?? 0,
    prepBeforeMinutes: input.prepBeforeMinutes ?? 0,
    reminder: input.reminder ?? null,
  };

  if (input.repeat) {
    if (input.date > addDays(ctx.today, MAX_HORIZON_DAYS)) {
      throw validationError([{ field: 'date', message: 'Une réunion récurrente commence au plus tard dans un an' }]);
    }
    const series: SeriesRow = {
      id: input.id ?? newId(),
      ...template,
      startTime: input.startTime,
      endTime: input.endTime,
      weekdays: input.repeat.weekdays,
      startDate: input.date,
      until: input.repeat.until ?? null,
      createdAt: ctx.now,
      updatedAt: ctx.now,
    };
    const first = firstDateFrom(series, input.date);
    if (!first) throw noDateLeft();
    await repo.series.insert(series);
    await ensureOccurrences(repo, ctx, first, [series]);
    return serializeEvent((await repo.events.get(occurrenceId(series.id, first)))!, ctx.timezone, series);
  }

  const row: EventRow = {
    id: input.id ?? newId(),
    seriesId: null,
    occurrenceDate: null,
    ...template,
    startsAt: localToUtc(input.date, input.startTime, ctx.timezone).toISOString(),
    endsAt: localToUtc(input.date, input.endTime, ctx.timezone).toISOString(),
    decisions: null,
    status: 'PREVU',
    completedAt: null,
    createdAt: ctx.now,
    updatedAt: ctx.now,
  };
  await repo.events.insert(row);
  return serializeEvent(row, ctx.timezone);
}

// ---------------------------------------------------------------------------------------------
// Modification

type UpdateInput = ReturnType<typeof updateEventSchema.parse>;

/** Champs communs au modèle d'une série et à ses occurrences, tels que fournis par la modification. */
function sharedFields(input: UpdateInput): Partial<EventRow & SeriesRow> {
  const out: Partial<EventRow & SeriesRow> = {};
  if (input.type !== undefined) out.type = input.type;
  if (input.title !== undefined) out.title = input.title;
  if (input.location !== undefined) out.location = input.location;
  if (input.link !== undefined) out.link = input.link;
  if (input.participants !== undefined) out.participants = input.participants;
  if (input.agenda !== undefined) out.agenda = input.agenda;
  if (input.travelBeforeMinutes !== undefined) out.travelBeforeMinutes = input.travelBeforeMinutes;
  if (input.prepBeforeMinutes !== undefined) out.prepBeforeMinutes = input.prepBeforeMinutes;
  if (input.reminder !== undefined) out.reminder = input.reminder;
  return out;
}

async function linksPatch(repo: Repo, input: UpdateInput, current: { goalId: string | null; milestoneId: string | null }) {
  if (input.goalId === undefined && input.milestoneId === undefined) return {};
  return resolveTaskLinks(
    repo,
    input.goalId === undefined ? current.goalId : input.goalId,
    input.milestoneId === undefined ? current.milestoneId : input.milestoneId,
  );
}

async function updateOne(repo: Repo, ctx: Ctx, existing: EventRow, input: UpdateInput): Promise<EventRow> {
  const start = local(existing.startsAt, ctx.timezone);
  const date = input.date ?? start.date;
  const startTime = input.startTime ?? start.time;
  const endTime = input.endTime ?? local(existing.endsAt, ctx.timezone).time;
  if (endTime <= startTime) throw endBeforeStart();
  const patch: Partial<EventRow> = { ...sharedFields(input), ...(await linksPatch(repo, input, existing)) };
  if (input.date || input.startTime || input.endTime) {
    patch.startsAt = localToUtc(date, startTime, ctx.timezone).toISOString();
    patch.endsAt = localToUtc(date, endTime, ctx.timezone).toISOString();
  }
  return repo.events.update(existing.id, { ...patch, updatedAt: ctx.now });
}

const sameDays = (a: readonly number[], b: readonly number[]) => a.length === b.length && a.every((d, i) => d === b[i]);

/**
 * « Cette occurrence et les suivantes » : seuls les champs fournis sont appliqués au modèle et aux
 * occurrences de cette date et des suivantes. Changer les jours coupe la série à cette date.
 */
async function updateFollowing(repo: Repo, ctx: Ctx, existing: EventRow, input: UpdateInput) {
  if (input.date !== undefined) {
    throw validationError([{ field: 'date', message: 'Pour changer de jour, modifie seulement cette occurrence' }]);
  }
  const series = await requireSeries(repo, existing.seriesId!);
  const from = existing.occurrenceDate!;
  const changed: Partial<EventRow & SeriesRow> = { ...sharedFields(input), ...(await linksPatch(repo, input, series)) };

  let times: { startTime: string; endTime: string } | null = null;
  if (input.startTime || input.endTime) {
    const startTime = input.startTime ?? local(existing.startsAt, ctx.timezone).time;
    const endTime = input.endTime ?? local(existing.endsAt, ctx.timezone).time;
    if (endTime <= startTime) throw endBeforeStart();
    times = { startTime, endTime };
  }

  const until = input.repeat?.until !== undefined ? input.repeat.until : series.until;
  if (until !== null && until < from) {
    throw validationError([{ field: 'repeat.until', message: 'La fin de la répétition doit suivre cette occurrence' }]);
  }
  const weekdays = input.repeat?.weekdays ?? series.weekdays;
  const rule = { weekdays, startDate: from, until };
  const first = firstDateFrom(rule, from);
  if (!first) throw noDateLeft();

  const toEvent = (o: EventRow): Partial<EventRow> => {
    const p: Partial<EventRow> = {};
    for (const key of ['type', 'title', 'location', 'link', 'participants', 'agenda', 'goalId', 'milestoneId', 'travelBeforeMinutes', 'prepBeforeMinutes', 'reminder'] as const) {
      if (changed[key] !== undefined) (p as Record<string, unknown>)[key] = changed[key];
    }
    if (times) {
      // Chaque occurrence garde son jour (même déplacée) ; seules les heures changent.
      const day = local(o.startsAt, ctx.timezone).date;
      p.startsAt = localToUtc(day, times.startTime, ctx.timezone).toISOString();
      p.endsAt = localToUtc(day, times.endTime, ctx.timezone).toISOString();
    }
    return p;
  };
  const later = (await repo.events.bySeries(series.id)).filter((o) => o.occurrenceDate! >= from);

  if (!sameDays(weekdays, series.weekdays) && from > series.startDate) {
    // Nouveaux jours : l'ancienne série s'arrête la veille, une nouvelle commence à cette date.
    // Les occurrences déjà réalisées sont conservées (avec leurs décisions).
    const next: SeriesRow = {
      ...series,
      ...(changed as Partial<SeriesRow>),
      ...(times ?? {}),
      id: newId(),
      weekdays,
      startDate: from,
      until,
      createdAt: ctx.now,
      updatedAt: ctx.now,
    };
    await repo.series.update(series.id, { until: addDays(from, -1), updatedAt: ctx.now });
    for (const o of later) if (o.status !== 'REALISE') await repo.events.remove(o.id);
    await repo.series.insert(next);
    await ensureOccurrences(repo, ctx, first, [next]);
    return serializeEvent((await repo.events.get(occurrenceId(next.id, first)))!, ctx.timezone, next);
  }

  const updated = await repo.series.update(series.id, {
    ...(changed as Partial<SeriesRow>),
    ...(times ?? {}),
    weekdays,
    until,
    updatedAt: ctx.now,
  });
  for (const o of later) {
    const outside = (until !== null && o.occurrenceDate! > until) || !weekdays.includes(isoWeekday(o.occurrenceDate!));
    if (outside && o.status !== 'REALISE') {
      await repo.events.remove(o.id);
      continue;
    }
    const p = toEvent(o);
    if (Object.keys(p).length > 0) await repo.events.update(o.id, { ...p, updatedAt: ctx.now });
  }
  await ensureOccurrences(repo, ctx, first, [updated]);
  const after = (await repo.events.get(existing.id)) ?? (await repo.events.get(occurrenceId(updated.id, first)))!;
  return serializeEvent(after, ctx.timezone, updated);
}

export async function updateEvent(repo: Repo, ctx: Ctx, id: string, raw: unknown, rawQuery: unknown = {}) {
  const { scope } = parseInput(scopeQuery, rawQuery);
  const input = parseInput(updateEventSchema, raw);
  const existing = await requireEvent(repo, id);
  if (existing.seriesId && scope !== 'occurrence') return updateFollowing(repo, ctx, existing, input);
  if (input.repeat !== undefined) {
    throw validationError([
      {
        field: 'repeat',
        message: existing.seriesId
          ? 'La répétition se change pour cette occurrence et les suivantes'
          : 'Ce rendez-vous ne se répète pas : crée une réunion récurrente',
      },
    ]);
  }
  const row = await updateOne(repo, ctx, existing, input);
  return serializeEvent(row, ctx.timezone, row.seriesId ? await repo.series.get(row.seriesId) : null);
}

// ---------------------------------------------------------------------------------------------
// Suppression et statuts

/**
 * Hors série : supprime le rendez-vous. Occurrence : `occurrence` l'annule (réouvrable), `following`
 * arrête la série la veille et supprime la suite (sauf réalisée), `series` supprime toute la série.
 * Les tâches liées sont toujours conservées, sans lien.
 */
export async function deleteEvent(repo: Repo, ctx: Ctx, id: string, rawQuery: unknown = {}): Promise<string> {
  const { scope } = parseInput(scopeQuery, rawQuery);
  const e = await requireEvent(repo, id);
  if (!e.seriesId) {
    await repo.events.remove(id);
    return 'Événement supprimé';
  }
  if (scope === 'occurrence') {
    await cancelEvent(repo, ctx, id);
    return 'Occurrence annulée';
  }
  const series = await requireSeries(repo, e.seriesId);
  const from = e.occurrenceDate!;
  if (scope === 'series' || from <= series.startDate) {
    await repo.series.remove(series.id);
    return 'Série supprimée';
  }
  await repo.series.update(series.id, { until: addDays(from, -1), updatedAt: ctx.now });
  for (const o of await repo.events.bySeries(series.id)) {
    if (o.occurrenceDate! >= from && o.status !== 'REALISE') await repo.events.remove(o.id);
  }
  return 'Occurrences suivantes supprimées';
}

async function withSeries(repo: Repo, ctx: Ctx, e: EventRow) {
  return serializeEvent(e, ctx.timezone, e.seriesId ? await repo.series.get(e.seriesId) : null);
}

/** Réalisé : idempotent. Les décisions déjà notées sont conservées si le corps n'en fournit pas. */
export async function completeEvent(repo: Repo, ctx: Ctx, id: string, raw: unknown) {
  const input = parseInput(completeEventSchema, raw ?? {});
  const existing = await requireEvent(repo, id);
  if (existing.status === 'ANNULE') throw conflict('Un événement annulé ne peut pas être réalisé : rouvre-le d’abord');
  const patch: Partial<EventRow> = { status: 'REALISE', completedAt: existing.completedAt ?? ctx.now, updatedAt: ctx.now };
  if (input.decisions !== undefined) patch.decisions = input.decisions;
  return withSeries(repo, ctx, await repo.events.update(id, patch));
}

export async function reopenEvent(repo: Repo, ctx: Ctx, id: string) {
  const existing = await requireEvent(repo, id);
  if (existing.status === 'PREVU') return withSeries(repo, ctx, existing);
  return withSeries(repo, ctx, await repo.events.update(id, { status: 'PREVU', completedAt: null, updatedAt: ctx.now }));
}

export async function cancelEvent(repo: Repo, ctx: Ctx, id: string) {
  const existing = await requireEvent(repo, id);
  if (existing.status === 'ANNULE') return withSeries(repo, ctx, existing);
  if (existing.status === 'REALISE') throw conflict('Un événement réalisé ne peut pas être annulé : rouvre-le d’abord');
  return withSeries(repo, ctx, await repo.events.update(id, { status: 'ANNULE', updatedAt: ctx.now }));
}

/** Crée une tâche de préparation ou de suivi liée au rendez-vous (objectif et jalon hérités). */
export async function createEventTask(repo: Repo, ctx: Ctx, id: string, raw: unknown) {
  const input = parseInput(createEventTaskSchema, raw ?? {});
  const event = await requireEvent(repo, id);
  const prefix = input.role === 'PREPARATION' ? 'Préparer : ' : 'Suivi : ';
  const workDate =
    input.workDate === undefined ? defaultTaskDate(input.role, local(event.startsAt, ctx.timezone).date, ctx.today) : input.workDate;
  const row: TaskRow = {
    id: newId(),
    goalId: event.goalId,
    milestoneId: event.milestoneId,
    eventId: event.id,
    eventRole: input.role,
    title: input.title ?? `${prefix}${event.title}`.slice(0, 160),
    notes: null,
    workDate,
    dueDate: null,
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
