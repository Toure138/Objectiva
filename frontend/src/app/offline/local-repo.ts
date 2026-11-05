import type { Table } from 'dexie';

import type {
  EventQuery,
  EventRepo,
  GoalQuery,
  GoalRepo,
  MilestoneRepo,
  ReadingRepo,
  Repo,
  SeriesRepo,
  TaskQuery,
  TaskRepo,
} from '../../../../shared/src/domain/repo';
import { newId } from '../../../../shared/src/domain/repo';
import type { EventRow, GoalRow, ReadingRow, SeriesRow, TaskRow } from '../../../../shared/src/domain/rows';
import { ACTIVE_GOAL_STATUSES } from '../../../../shared/src/domain/rows';
import { sortTasksForList } from '../../../../shared/src/domain/views';
import { DomainError } from '../../../../shared/src/errors';
import type { Mutation, SyncedEntity } from '../../../../shared/src/sync.schemas';

import { type OfflineDb, type Stored } from './local-db';

// Implémentation IndexedDB de l'interface de stockage partagée (shared/src/domain/repo.ts).
// Chaque écriture est aussi enregistrée dans le journal d'envoi (`outbox`) avec une horloge hybride,
// dans la MÊME transaction : une modification n'est jamais « à moitié » enregistrée.
// Les tris et les cascades reproduisent exactement ceux du serveur (vérifié par les tests de parité).

const SYSTEM_FIELDS = new Set(['id', 'createdAt', 'updatedAt']);

const text = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
/** Texte croissant, les valeurs absentes en dernier (comme PostgreSQL). */
const nullsLast = (a: string | null, b: string | null): number =>
  a === b ? 0 : a === null ? 1 : b === null ? -1 : text(a, b);

export function clean<T extends object>(row: Stored<T>): T {
  const { _c, ...rest } = row;
  void _c;
  return rest as unknown as T;
}

const isConstraint = (e: unknown): boolean =>
  typeof e === 'object' && e !== null && (e as { name?: string }).name === 'ConstraintError';

export const duplicateId = (): DomainError =>
  new DomainError(409, 'CONFLICT', 'Cette donnée existe déjà (identifiant déjà utilisé)');

export class LocalRepo implements Repo {
  readonly tasks: TaskRepo;
  readonly goals: GoalRepo;
  readonly milestones: MilestoneRepo;
  readonly readings: ReadingRepo;
  readonly events: EventRepo;
  readonly series: SeriesRepo;

  /**
   * @param clock fournit la prochaine valeur de l'horloge hybride de l'appareil
   * @param record false pour appliquer des changements reçus du serveur (rien à renvoyer)
   */
  constructor(
    private readonly db: OfflineDb,
    private readonly clock: () => Promise<string>,
    private readonly record = true,
  ) {
    this.tasks = this.buildTasks();
    this.goals = this.buildGoals();
    this.milestones = this.buildMilestones();
    this.readings = this.buildReadings();
    this.events = this.buildEvents();
    this.series = this.buildSeries();
  }

  // --- Écriture générique

  private async enqueue(
    entity: SyncedEntity,
    op: Mutation['op'],
    id: string,
    fields?: Record<string, unknown>,
    createdAt?: string,
    clock?: string,
  ) {
    if (!this.record) return;
    const mutation: Mutation = { mutationId: newId(), entity, id, op };
    if (fields && clock) {
      mutation.fields = fields;
      mutation.clocks = Object.fromEntries(Object.keys(fields).map((k) => [k, clock]));
    }
    if (createdAt) mutation.createdAt = createdAt;
    await this.db.outbox.add({ mutation });
  }

  private async insertRow<R extends { id: string; createdAt: string; updatedAt: string }>(
    table: Table<Stored<R>, string>,
    entity: SyncedEntity,
    row: R,
  ): Promise<void> {
    const fields = Object.fromEntries(Object.entries(row).filter(([k]) => !SYSTEM_FIELDS.has(k)));
    const clock = this.record ? await this.clock() : undefined;
    const _c = clock ? Object.fromEntries(Object.keys(fields).map((k) => [k, clock])) : {};
    try {
      await table.add({ ...row, _c } as Stored<R>);
    } catch (e) {
      if (isConstraint(e)) throw duplicateId();
      throw e;
    }
    await this.enqueue(entity, 'create', row.id, fields, row.createdAt, clock);
  }

  private async updateRow<R extends { id: string; createdAt: string; updatedAt: string }>(
    table: Table<Stored<R>, string>,
    entity: SyncedEntity,
    id: string,
    patch: Partial<R>,
  ): Promise<R> {
    const current = await table.get(id);
    if (!current) throw new DomainError(404, 'NOT_FOUND', 'Élément introuvable');
    const defined = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
    const fields = Object.fromEntries(Object.entries(defined).filter(([k]) => !SYSTEM_FIELDS.has(k)));
    const next = { ...current, ...defined } as Stored<R>;
    if (Object.keys(fields).length > 0 && this.record) {
      const clock = await this.clock();
      next._c = { ...current._c, ...Object.fromEntries(Object.keys(fields).map((k) => [k, clock])) };
      await this.enqueue(entity, 'update', id, fields, undefined, clock);
    }
    await table.put(next);
    return clean(next) as R;
  }

  private async removeRow(
    table: Table<Stored<{ id: string }>, string>,
    entity: SyncedEntity,
    id: string,
  ): Promise<void> {
    await table.delete(id);
    await this.enqueue(entity, 'delete', id);
  }

  // --- Tâches

  private buildTasks(): TaskRepo {
    const table = this.db.tasks;
    const all = async (): Promise<TaskRow[]> => (await table.toArray()).map((r) => clean(r));
    const byCreation = (a: TaskRow, b: TaskRow) => text(a.createdAt, b.createdAt) || text(a.id, b.id);
    return {
      get: async (id) => {
        const r = await table.get(id);
        return r ? clean(r) : null;
      },
      list: async (q: TaskQuery) => {
        let rows = await all();
        if (q.status) rows = rows.filter((t) => t.status === q.status);
        if (q.goalId) rows = rows.filter((t) => t.goalId === q.goalId);
        if (q.unscheduled) rows = rows.filter((t) => t.workDate === null);
        else if (q.from || q.to) {
          rows = rows.filter(
            (t) => t.workDate !== null && (!q.from || t.workDate >= q.from) && (!q.to || t.workDate <= q.to),
          );
        }
        const sorted = sortTasksForList(rows);
        return { items: sorted.slice(q.offset, q.offset + q.limit), total: sorted.length };
      },
      listByGoals: async (goalIds) => (await all()).filter((t) => t.goalId !== null && goalIds.includes(t.goalId)),
      planned: async (date) => (await all()).filter((t) => t.status === 'TODO' && t.workDate === date).sort(byCreation),
      done: async (date) =>
        (await all())
          .filter((t) => t.status === 'DONE' && t.workDate === date)
          .sort((a, b) => nullsLast(a.completedAt, b.completedAt) || text(a.id, b.id)),
      toReschedule: async (date) =>
        (await all())
          .filter((t) => t.status === 'TODO' && t.workDate !== null && t.workDate < date)
          .sort((a, b) => text(a.workDate!, b.workDate!) || byCreation(a, b)),
      overdue: async (date) =>
        (await all())
          .filter(
            (t) =>
              t.status === 'TODO' &&
              t.dueDate !== null &&
              t.dueDate < date &&
              (t.workDate === null || t.workDate > date),
          )
          .sort((a, b) => text(a.dueDate!, b.dueDate!) || byCreation(a, b)),
      inRange: async (from, to) => {
        const inside = (d: string | null) => d !== null && d >= from && d <= to;
        return (await all()).filter((t) => inside(t.workDate) || inside(t.originalDate));
      },
      byEvent: async (eventId) => (await all()).filter((t) => t.eventId === eventId).sort(byCreation),
      insert: (row) => this.insertRow(table, 'tasks', row),
      update: (id, patch) => this.updateRow(table, 'tasks', id, patch),
      remove: (id) => this.removeRow(table as unknown as Table<Stored<{ id: string }>, string>, 'tasks', id),
    };
  }

  // --- Objectifs

  private buildGoals(): GoalRepo {
    const table = this.db.goals;
    const sorted = (rows: GoalRow[]) =>
      rows.sort((a, b) => text(a.endDate, b.endDate) || text(a.createdAt, b.createdAt) || text(a.id, b.id));
    return {
      get: async (id) => {
        const r = await table.get(id);
        return r ? clean(r) : null;
      },
      list: async (q: GoalQuery) => {
        let rows = (await table.toArray()).map((r) => clean(r));
        if (q.status) rows = rows.filter((g) => g.status === q.status);
        else if (q.statusIn) rows = rows.filter((g) => q.statusIn!.includes(g.status));
        if (q.category) rows = rows.filter((g) => g.category === q.category);
        return sorted(rows);
      },
      withoutNextAction: async () => {
        const open = new Set((await this.db.tasks.where('status').equals('TODO').toArray()).map((t) => t.goalId));
        const goals = (await table.toArray()).map((r) => clean(r));
        return sorted(
          goals.filter((g) => (ACTIVE_GOAL_STATUSES as readonly string[]).includes(g.status) && !open.has(g.id)),
        ).map((g) => ({
          id: g.id,
          title: g.title,
        }));
      },
      insert: (row) => this.insertRow(table, 'goals', row),
      update: (id, patch) => this.updateRow(table, 'goals', id, patch),
      remove: async (id) => {
        // Comme la base : jalons et relevés disparaissent avec l'objectif, ses tâches sont conservées sans objectif.
        // Ces effets sont les mêmes sur le serveur : aucune modification supplémentaire à envoyer.
        await this.db.milestones.where('goalId').equals(id).delete();
        await this.db.readings.where('goalId').equals(id).delete();
        await this.db.tasks.where('goalId').equals(id).modify({ goalId: null, milestoneId: null });
        await this.db.events.where('goalId').equals(id).modify({ goalId: null, milestoneId: null });
        await this.db.series.where('goalId').equals(id).modify({ goalId: null, milestoneId: null });
        await this.removeRow(table as unknown as Table<Stored<{ id: string }>, string>, 'goals', id);
      },
    };
  }

  private buildMilestones(): MilestoneRepo {
    const table = this.db.milestones;
    return {
      get: async (id) => {
        const r = await table.get(id);
        return r ? clean(r) : null;
      },
      listByGoals: async (goalIds) =>
        (await table.toArray()).filter((m) => goalIds.includes(m.goalId)).map((r) => clean(r)),
      insert: (row) => this.insertRow(table, 'milestones', row),
      update: (id, patch) => this.updateRow(table, 'milestones', id, patch),
      remove: async (id) => {
        await this.db.tasks.where('milestoneId').equals(id).modify({ milestoneId: null });
        await this.db.events.where('milestoneId').equals(id).modify({ milestoneId: null });
        await this.db.series.where('milestoneId').equals(id).modify({ milestoneId: null });
        await this.removeRow(table as unknown as Table<Stored<{ id: string }>, string>, 'milestones', id);
      },
    };
  }

  // --- Rendez-vous et réunions récurrentes (spec 009)

  private buildEvents(): EventRepo {
    const table = this.db.events;
    const all = async (): Promise<EventRow[]> => (await table.toArray()).map((r) => clean(r));
    const byStart = (a: EventRow, b: EventRow) =>
      text(a.startsAt, b.startsAt) || text(a.createdAt, b.createdAt) || text(a.id, b.id);
    return {
      get: async (id) => {
        const r = await table.get(id);
        return r ? clean(r) : null;
      },
      list: async (q: EventQuery) => {
        const rows = (await all())
          .filter((e) => !q.status || e.status === q.status)
          .filter((e) => !q.notStatus || e.status !== q.notStatus)
          .filter((e) => !q.startFrom || e.startsAt >= q.startFrom)
          .filter((e) => !q.startBefore || e.startsAt < q.startBefore)
          .sort(byStart);
        return q.limit === undefined ? rows : rows.slice(0, q.limit);
      },
      bySeries: async (seriesId) =>
        (await table.where('seriesId').equals(seriesId).toArray())
          .map((r) => clean(r))
          .sort((a, b) => text(a.occurrenceDate ?? '', b.occurrenceDate ?? '')),
      insert: (row) => this.insertRow(table, 'events', row),
      insertIfAbsent: async (row) => {
        if (await table.get(row.id)) return false;
        await this.insertRow(table, 'events', row);
        return true;
      },
      update: (id, patch) => this.updateRow(table, 'events', id, patch),
      remove: async (id) => {
        // Comme la base : les tâches liées sont conservées, sans lien (aucune modification à envoyer).
        await this.db.tasks.where('eventId').equals(id).modify({ eventId: null });
        await this.removeRow(table as unknown as Table<Stored<{ id: string }>, string>, 'events', id);
      },
    };
  }

  private buildSeries(): SeriesRepo {
    const table = this.db.series;
    return {
      get: async (id) => {
        const r = await table.get(id);
        return r ? clean(r) : null;
      },
      list: async () =>
        (await table.toArray())
          .map((r) => clean(r))
          .sort(
            (a: SeriesRow, b: SeriesRow) =>
              text(a.startDate, b.startDate) || text(a.createdAt, b.createdAt) || text(a.id, b.id),
          ),
      insert: (row) => this.insertRow(table, 'event_series', row),
      update: (id, patch) => this.updateRow(table, 'event_series', id, patch),
      remove: async (id) => {
        // Comme la base : les occurrences disparaissent avec la série, leurs tâches sont détachées.
        const occurrences = await this.db.events.where('seriesId').equals(id).primaryKeys();
        if (occurrences.length > 0) {
          await this.db.tasks.where('eventId').anyOf(occurrences).modify({ eventId: null });
          await this.db.events.bulkDelete(occurrences);
        }
        await this.removeRow(table as unknown as Table<Stored<{ id: string }>, string>, 'event_series', id);
      },
    };
  }

  private buildReadings(): ReadingRepo {
    const table = this.db.readings;
    return {
      get: async (id) => {
        const r = await table.get(id);
        return r ? clean(r) : null;
      },
      listByGoals: async (goalIds) => {
        const rows = (await table.toArray()).filter((r) => goalIds.includes(r.goalId)).map((r) => clean(r));
        // Les 50 plus récents de chaque objectif, comme le serveur.
        const newest = (a: ReadingRow, b: ReadingRow) =>
          text(b.readOn, a.readOn) || text(b.createdAt, a.createdAt) || text(b.id, a.id);
        return goalIds.flatMap((goalId) =>
          rows
            .filter((r) => r.goalId === goalId)
            .sort(newest)
            .slice(0, 50),
        );
      },
      insert: (row) => this.insertRow(table, 'goal_readings', row),
      remove: (id) => this.removeRow(table as unknown as Table<Stored<{ id: string }>, string>, 'goal_readings', id),
    };
  }
}
