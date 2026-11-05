import { z } from 'zod';

import { layoutDay, type AgendaSlot } from '../agenda.rules';
import { addDays, addMonths } from '../dates';
import { parseInput } from '../errors';
import { localDaysToUtc, utcToLocal } from '../events.rules';
import { ensureOccurrences } from './events';
import type { Ctx, Repo } from './repo';
import type { EventRow } from './rows';

// Vue d'ensemble des planifications (spec 010) : calendrier d'un mois et liste des réunions récurrentes.
// Une seule implémentation pour le serveur et le téléphone.

export const monthQuery = z.object({
  month: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Format attendu : AAAA-MM')
    .optional(),
});

const localDate = (instant: string, timezone: string) => utcToLocal(new Date(instant), timezone).date;
const minutesOf = (instant: string, timezone: string) => {
  const t = utcToLocal(new Date(instant), timezone).time;
  return Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
};

/** Au moins un chevauchement ce jour-là (mêmes règles que l'agenda : horaires ou trajet / préparation). */
function hasConflict(events: EventRow[], timezone: string): boolean {
  if (events.length < 2) return false;
  const slots: AgendaSlot[] = events.map((e) => {
    const start = minutesOf(e.startsAt, timezone);
    // Un rendez-vous qui finirait après minuit reste borné à la journée.
    const end = Math.max(start + 1, minutesOf(e.endsAt, timezone));
    return { id: e.id, start, end, blockedStart: start - e.travelBeforeMinutes - e.prepBeforeMinutes };
  });
  return [...layoutDay(slots).values()].some((p) => p.conflicts.length > 0);
}

/**
 * Calendrier d'un mois : pour chaque jour, rendez-vous non annulés, tâches à faire, tâches faites et présence
 * d'un chevauchement. Les occurrences des réunions récurrentes sont créées jusqu'à la fin du mois.
 */
export async function getCalendarMonth(repo: Repo, ctx: Ctx, rawQuery: unknown) {
  const { month: asked } = parseInput(monthQuery, rawQuery);
  const month = asked ?? ctx.today.slice(0, 7);
  const first = `${month}-01`;
  const last = addDays(`${addMonths(month, 1)}-01`, -1);
  await ensureOccurrences(repo, ctx, last);

  const { start, end } = localDaysToUtc(first, last, ctx.timezone);
  const events = await repo.events.list({ startFrom: start.toISOString(), startBefore: end.toISOString(), notStatus: 'ANNULE' });
  const { items: tasks } = await repo.tasks.list({ from: first, to: last, limit: 100_000, offset: 0 });

  const days = [];
  for (let date = first; date <= last; date = addDays(date, 1)) {
    const dayEvents = events.filter((e) => localDate(e.startsAt, ctx.timezone) === date);
    const dayTasks = tasks.filter((t) => t.workDate === date);
    days.push({
      date,
      events: dayEvents.length,
      tasks: dayTasks.filter((t) => t.status === 'TODO').length,
      done: dayTasks.filter((t) => t.status === 'DONE').length,
      conflict: hasConflict(dayEvents, ctx.timezone),
    });
  }
  return { month, days };
}

/**
 * Réunions récurrentes : modèle, règle et prochaine occurrence non annulée à partir d'aujourd'hui.
 * En cours d'abord (par heure de début), terminées ensuite.
 */
export async function listSeries(repo: Repo, ctx: Ctx) {
  await ensureOccurrences(repo, ctx);
  const out = [];
  for (const s of await repo.series.list()) {
    const next = (await repo.events.bySeries(s.id))
      .filter((o) => o.status !== 'ANNULE' && localDate(o.startsAt, ctx.timezone) >= ctx.today)
      .sort((a, b) => (a.startsAt < b.startsAt ? -1 : a.startsAt > b.startsAt ? 1 : 0))[0];
    out.push({
      id: s.id,
      type: s.type,
      title: s.title,
      startTime: s.startTime,
      endTime: s.endTime,
      location: s.location,
      goalId: s.goalId,
      weekdays: s.weekdays,
      startDate: s.startDate,
      until: s.until,
      nextOccurrence: next ? { id: next.id, date: localDate(next.startsAt, ctx.timezone) } : null,
      ended: s.until !== null && s.until < ctx.today,
    });
  }
  const text = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
  return out.sort(
    (a, b) => Number(a.ended) - Number(b.ended) || text(a.startTime, b.startTime) || text(a.title, b.title) || text(a.id, b.id),
  );
}
