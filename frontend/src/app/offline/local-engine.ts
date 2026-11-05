import type { Table } from 'dexie';

import { todayIn } from '../../../../shared/src/dates';
import * as events from '../../../../shared/src/domain/events';
import * as goals from '../../../../shared/src/domain/goals';
import type { Ctx, Repo } from '../../../../shared/src/domain/repo';
import { newId } from '../../../../shared/src/domain/repo';
import * as tasks from '../../../../shared/src/domain/tasks';
import { getReview, getToday } from '../../../../shared/src/domain/today';
import { DomainError } from '../../../../shared/src/errors';
import { formatHlc, initialHlc, parseHlc, receiveHlc, tickHlc, type Hlc } from '../../../../shared/src/hlc';
import { idParam } from '../../../../shared/src/ids';
import {
  SYNCED_ENTITIES,
  type Mutation,
  type MutationResult,
  type SyncChange,
  type SyncedEntity,
} from '../../../../shared/src/sync.schemas';

import { META, type OfflineDb, type OutboxItem, type Stored } from './local-db';
import { LocalRepo } from './local-repo';

/** Réponse d'un appel traité localement : même forme que l'API HTTP (statut + enveloppe). */
export interface ApiResult {
  status: number;
  body:
    | { success: true; data?: unknown; message?: string }
    | { success: false; code: string; message: string; details?: unknown };
}

export interface EngineEnv {
  /** Fuseau horaire de l'utilisateur (pour « aujourd'hui »). */
  timezone: () => string;
  /** Horloge (injectée pour les tests). */
  now?: () => Date;
}

/** Modification refusée par le serveur : conservée pour être montrée à l'utilisateur. */
export interface Rejection {
  entity: string;
  id: string;
  message: string;
  at: string;
}

interface Call {
  repo: Repo;
  ctx: Ctx;
  params: Record<string, string>;
  query: Record<string, string>;
  body: unknown;
}
type Handler = (c: Call) => Promise<{ status?: number; data?: unknown; message?: string }>;

const SYSTEM = new Set(['id', 'createdAt', 'updatedAt']);

// Mêmes chemins, mêmes statuts et mêmes réponses que l'API (backend/src/modules/*/*.routes.ts).
const ROUTES: { method: string; pattern: string; write: boolean; handler: Handler }[] = [
  {
    method: 'GET',
    pattern: '/goals',
    write: false,
    handler: async (c) => ({ data: await goals.listGoals(c.repo, c.ctx, c.query) }),
  },
  {
    method: 'POST',
    pattern: '/goals',
    write: true,
    handler: async (c) => ({ status: 201, data: await goals.createGoal(c.repo, c.ctx, c.body) }),
  },
  {
    method: 'GET',
    pattern: '/goals/:id',
    write: false,
    handler: async (c) => ({ data: await goals.getGoal(c.repo, c.ctx, idParam(c.params['id'], 'Objectif')) }),
  },
  {
    method: 'PATCH',
    pattern: '/goals/:id',
    write: true,
    handler: async (c) => ({
      data: await goals.updateGoal(c.repo, c.ctx, idParam(c.params['id'], 'Objectif'), c.body),
    }),
  },
  {
    method: 'DELETE',
    pattern: '/goals/:id',
    write: true,
    handler: async (c) => {
      await goals.deleteGoal(c.repo, idParam(c.params['id'], 'Objectif'));
      return { message: 'Objectif supprimé' };
    },
  },
  {
    method: 'POST',
    pattern: '/goals/:id/milestones',
    write: true,
    handler: async (c) => ({
      status: 201,
      data: await goals.createMilestone(c.repo, c.ctx, idParam(c.params['id'], 'Objectif'), c.body),
    }),
  },
  {
    method: 'POST',
    pattern: '/goals/:id/readings',
    write: true,
    handler: async (c) => ({
      status: 201,
      data: await goals.createReading(c.repo, c.ctx, idParam(c.params['id'], 'Objectif'), c.body),
    }),
  },
  {
    method: 'PATCH',
    pattern: '/milestones/:id',
    write: true,
    handler: async (c) => ({
      data: await goals.updateMilestone(c.repo, c.ctx, idParam(c.params['id'], 'Jalon'), c.body),
    }),
  },
  {
    method: 'DELETE',
    pattern: '/milestones/:id',
    write: true,
    handler: async (c) => {
      await goals.deleteMilestone(c.repo, idParam(c.params['id'], 'Jalon'));
      return { message: 'Jalon supprimé' };
    },
  },
  {
    method: 'DELETE',
    pattern: '/readings/:id',
    write: true,
    handler: async (c) => ({ data: await goals.deleteReading(c.repo, c.ctx, idParam(c.params['id'], 'Relevé')) }),
  },

  {
    method: 'GET',
    pattern: '/tasks',
    write: false,
    handler: async (c) => ({ data: await tasks.listTasks(c.repo, c.ctx, c.query) }),
  },
  {
    method: 'POST',
    pattern: '/tasks',
    write: true,
    handler: async (c) => ({ status: 201, data: await tasks.createTask(c.repo, c.ctx, c.body) }),
  },
  {
    method: 'GET',
    pattern: '/tasks/:id',
    write: false,
    handler: async (c) => ({ data: await tasks.getTask(c.repo, c.ctx, idParam(c.params['id'], 'Tâche')) }),
  },
  {
    method: 'PATCH',
    pattern: '/tasks/:id',
    write: true,
    handler: async (c) => ({ data: await tasks.updateTask(c.repo, c.ctx, idParam(c.params['id'], 'Tâche'), c.body) }),
  },
  {
    method: 'DELETE',
    pattern: '/tasks/:id',
    write: true,
    handler: async (c) => {
      await tasks.deleteTask(c.repo, idParam(c.params['id'], 'Tâche'));
      return { message: 'Tâche supprimée' };
    },
  },
  {
    method: 'POST',
    pattern: '/tasks/:id/complete',
    write: true,
    handler: async (c) => ({ data: await tasks.completeTask(c.repo, c.ctx, idParam(c.params['id'], 'Tâche')) }),
  },
  {
    method: 'POST',
    pattern: '/tasks/:id/reopen',
    write: true,
    handler: async (c) => ({ data: await tasks.reopenTask(c.repo, c.ctx, idParam(c.params['id'], 'Tâche')) }),
  },
  {
    method: 'POST',
    pattern: '/tasks/:id/reschedule',
    write: true,
    handler: async (c) => ({
      data: await tasks.rescheduleTask(c.repo, c.ctx, idParam(c.params['id'], 'Tâche'), c.body),
    }),
  },
  {
    method: 'POST',
    pattern: '/tasks/:id/cancel',
    write: true,
    handler: async (c) => ({ data: await tasks.cancelTask(c.repo, c.ctx, idParam(c.params['id'], 'Tâche')) }),
  },

  // Rendez-vous et réunions récurrentes (spec 009). Les lectures par période créent les occurrences à venir
  // (comme le serveur) : elles écrivent, donc dans une transaction d'écriture.
  {
    method: 'GET',
    pattern: '/events',
    write: true,
    handler: async (c) => ({ data: await events.listEvents(c.repo, c.ctx, c.query) }),
  },
  {
    method: 'POST',
    pattern: '/events',
    write: true,
    handler: async (c) => ({ status: 201, data: await events.createEvent(c.repo, c.ctx, c.body) }),
  },
  {
    method: 'GET',
    pattern: '/events/:id',
    write: false,
    handler: async (c) => ({ data: await events.getEvent(c.repo, c.ctx, idParam(c.params['id'], 'Événement')) }),
  },
  {
    method: 'PATCH',
    pattern: '/events/:id',
    write: true,
    handler: async (c) => ({
      data: await events.updateEvent(c.repo, c.ctx, idParam(c.params['id'], 'Événement'), c.body, c.query),
    }),
  },
  {
    method: 'DELETE',
    pattern: '/events/:id',
    write: true,
    handler: async (c) => ({
      message: await events.deleteEvent(c.repo, c.ctx, idParam(c.params['id'], 'Événement'), c.query),
    }),
  },
  {
    method: 'POST',
    pattern: '/events/:id/complete',
    write: true,
    handler: async (c) => ({
      data: await events.completeEvent(c.repo, c.ctx, idParam(c.params['id'], 'Événement'), c.body),
    }),
  },
  {
    method: 'POST',
    pattern: '/events/:id/reopen',
    write: true,
    handler: async (c) => ({ data: await events.reopenEvent(c.repo, c.ctx, idParam(c.params['id'], 'Événement')) }),
  },
  {
    method: 'POST',
    pattern: '/events/:id/cancel',
    write: true,
    handler: async (c) => ({ data: await events.cancelEvent(c.repo, c.ctx, idParam(c.params['id'], 'Événement')) }),
  },
  {
    method: 'POST',
    pattern: '/events/:id/tasks',
    write: true,
    handler: async (c) => ({
      status: 201,
      data: await events.createEventTask(c.repo, c.ctx, idParam(c.params['id'], 'Événement'), c.body),
    }),
  },
  {
    method: 'GET',
    pattern: '/agenda',
    write: true,
    handler: async (c) => ({ data: await events.getAgenda(c.repo, c.ctx, c.query) }),
  },
  {
    method: 'GET',
    pattern: '/today',
    write: true,
    handler: async (c) => ({ data: await getToday(c.repo, c.ctx, c.query) }),
  },
  {
    method: 'GET',
    pattern: '/reviews',
    write: true,
    handler: async (c) => ({ data: await getReview(c.repo, c.ctx, c.query) }),
  },
];

const COMPILED = ROUTES.map((r) => ({
  ...r,
  keys: [...r.pattern.matchAll(/:(\w+)/g)].map((m) => m[1]!),
  regex: new RegExp(`^${r.pattern.replace(/:\w+/g, '([^/]+)')}$`),
}));

/** Moteur local : traite sur le téléphone les appels que le serveur traiterait, avec le même code métier. */
export class LocalEngine {
  private readonly now: () => Date;

  constructor(
    readonly db: OfflineDb,
    private readonly env: EngineEnv,
  ) {
    this.now = env.now ?? (() => new Date());
  }

  /** `true` si cet appel peut être traité localement (sinon l'appelant passe par le réseau). */
  handles(method: string, path: string): boolean {
    return this.match(method, path) !== null;
  }

  /** `true` si cet appel peut écrire (y compris une lecture qui crée les occurrences à venir). */
  writes(method: string, path: string): boolean {
    return this.match(method, path)?.route.write === true;
  }

  private match(method: string, path: string) {
    const url = new URL(path, 'http://local');
    for (const route of COMPILED) {
      if (route.method !== method.toUpperCase()) continue;
      const m = route.regex.exec(url.pathname);
      if (m) {
        const params = Object.fromEntries(route.keys.map((k, i) => [k, decodeURIComponent(m[i + 1]!)]));
        return { route, params, query: Object.fromEntries(url.searchParams) as Record<string, string> };
      }
    }
    return null;
  }

  /** Traite un appel. Renvoie `null` si la route n'est pas gérée localement. */
  async call(method: string, path: string, body?: unknown): Promise<ApiResult | null> {
    const found = this.match(method, path);
    if (!found) return null;
    const { route, params, query } = found;
    const run = async (): Promise<ApiResult> => {
      const clock = () => this.nextClock();
      const repo = new LocalRepo(this.db, clock);
      const now = this.now();
      const timezone = this.env.timezone();
      const ctx: Ctx = { now: now.toISOString(), today: todayIn(timezone, now), timezone };
      const out = await route.handler({ repo, ctx, params, query, body });
      return {
        status: out.status ?? 200,
        body: {
          success: true,
          ...(out.data !== undefined ? { data: out.data } : {}),
          ...(out.message ? { message: out.message } : {}),
        },
      };
    };
    try {
      return route.write
        ? await this.db.transaction('rw', this.db.allTables, run)
        : await this.db.transaction('r', this.db.allTables, run);
    } catch (e) {
      if (e instanceof DomainError) {
        return { status: e.status, body: { success: false, code: e.code, message: e.message, details: e.details } };
      }
      throw e;
    }
  }

  // --- Horloge hybride

  async deviceId(): Promise<string> {
    let id = await this.db.getMeta<string>(META.deviceId);
    if (!id) {
      id = newId();
      await this.db.setMeta(META.deviceId, id);
    }
    return id;
  }

  private async loadHlc(): Promise<Hlc> {
    return (await this.db.getMeta<Hlc>(META.hlc)) ?? initialHlc(await this.deviceId());
  }

  /** Prochaine valeur de l'horloge de cet appareil (toujours supérieure aux précédentes et à celles reçues). */
  private async nextClock(): Promise<string> {
    const next = tickHlc(await this.loadHlc(), this.now().getTime());
    await this.db.setMeta(META.hlc, next);
    return formatHlc(next);
  }

  // --- Journal d'envoi

  /** Modifications en attente, dans l'ordre où elles ont été faites. */
  async pending(limit = 200): Promise<OutboxItem[]> {
    return this.db.outbox.orderBy('seq').limit(limit).toArray();
  }

  async pendingCount(): Promise<number> {
    return this.db.outbox.count();
  }

  /**
   * Le serveur a traité ces modifications (appliquées, ignorées ou refusées) : on les sort du journal.
   * Les refus sont conservés à part pour être montrés (« à corriger »), jamais perdus en silence.
   */
  async acknowledge(results: MutationResult[]): Promise<void> {
    await this.db.transaction('rw', this.db.outbox, this.db.meta, async () => {
      const byId = new Map(results.map((r) => [r.mutationId, r]));
      const done = (await this.db.outbox.toArray()).filter((o) => byId.has(o.mutation.mutationId));
      const refused: Rejection[] = [];
      for (const item of done) {
        const r = byId.get(item.mutation.mutationId)!;
        if (r.status === 'rejected') {
          refused.push({
            entity: item.mutation.entity,
            id: item.mutation.id,
            message: r.message ?? 'Modification refusée par le serveur',
            at: this.now().toISOString(),
          });
        }
      }
      await this.db.outbox.bulkDelete(done.map((o) => o.seq!));
      await this.recordRejections(refused);
    });
  }

  /** Conserve des refus du serveur pour les montrer (les 100 derniers). */
  async recordRejections(refused: Omit<Rejection, 'at'>[]): Promise<void> {
    if (refused.length === 0) return;
    const at = this.now().toISOString();
    const before = (await this.db.getMeta<Rejection[]>('rejections')) ?? [];
    await this.db.setMeta('rejections', [...before, ...refused.map((r) => ({ ...r, at }))].slice(-100));
  }

  // --- Serveur remplacé ou restauré (changement d'époque)

  /**
   * Tout ce que contient le téléphone, sous forme de créations (objectifs d'abord, puis jalons, relevés et
   * tâches, pour que les parents existent avant leurs enfants), avec l'horloge de chaque champ. Un champ
   * sans horloge (écrit par l'API) reçoit l'horloge minimale : il ne l'emporte jamais sur une vraie modification.
   */
  async snapshot(): Promise<Mutation[]> {
    const floor = formatHlc(initialHlc(await this.deviceId()));
    // Parents d'abord (ordre du protocole) : objectifs, jalons, relevés, séries, rendez-vous, tâches.
    const sources = SYNCED_ENTITIES.map(
      (entity) =>
        [entity, this.tableFor(entity)] as [SyncedEntity, Table<Stored<{ id: string; createdAt: string }>, string>],
    );
    const out: Mutation[] = [];
    for (const [entity, table] of sources) {
      // Ordre de création : un jalon créé avant un autre garde sa place sur le serveur reconstruit.
      const rows = (await table.toArray()).sort((a, b) =>
        a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0,
      );
      for (const row of rows) {
        const fields = Object.fromEntries(Object.entries(row).filter(([k]) => !SYSTEM.has(k) && k !== '_c'));
        const clocks = Object.fromEntries(Object.keys(fields).map((k) => [k, row._c?.[k] ?? floor]));
        out.push({ mutationId: newId(), entity, id: row.id, op: 'create', fields, clocks, createdAt: row.createdAt });
      }
    }
    return out;
  }

  /** Repart de zéro avec ce serveur : tout sera relu (et fusionné champ par champ) à la prochaine récupération. */
  async restartFrom(epoch: string, reseeded: boolean): Promise<void> {
    await this.db.transaction('rw', this.db.meta, async () => {
      await this.db.setMeta(META.cursor, 0);
      await this.db.setMeta(META.epoch, epoch);
      if (reseeded) await this.db.setMeta(META.reseededAt, this.now().toISOString());
    });
  }

  async rejections(): Promise<Rejection[]> {
    return (await this.db.getMeta<Rejection[]>('rejections')) ?? [];
  }

  async clearRejections(): Promise<void> {
    await this.db.setMeta('rejections', []);
  }

  // --- Changements reçus du serveur

  /**
   * Applique une page de changements. Champ par champ, la valeur dont l'horloge est la plus récente
   * l'emporte : une modification locale plus récente que celle du serveur est conservée.
   * Une suppression faite localement et pas encore envoyée n'est pas annulée par une modification reçue.
   */
  async applyPull(changes: SyncChange[], cursor: number, epoch: string): Promise<void> {
    await this.db.transaction('rw', this.db.allTables, async () => {
      const pendingDeletes = new Set(
        (await this.db.outbox.toArray())
          .filter((o) => o.mutation.op === 'delete')
          .map((o) => `${o.mutation.entity}:${o.mutation.id}`),
      );
      const remote = new LocalRepo(this.db, () => this.nextClock(), false);
      let maxClock: Hlc | null = null;

      for (const change of changes) {
        for (const c of Object.values(change.clocks ?? {})) {
          const h = parseHlc(c);
          if (h && (!maxClock || formatHlc(h) > formatHlc(maxClock))) maxClock = h;
        }
        if (change.op === 'delete') {
          if (change.entity === 'goals') await remote.goals.remove(change.id);
          else if (change.entity === 'milestones') await remote.milestones.remove(change.id);
          else if (change.entity === 'goal_readings') await remote.readings.remove(change.id);
          else if (change.entity === 'event_series') await remote.series.remove(change.id);
          else if (change.entity === 'events') await remote.events.remove(change.id);
          else await remote.tasks.remove(change.id);
          continue;
        }
        if (pendingDeletes.has(`${change.entity}:${change.id}`)) continue;
        const table = this.tableFor(change.entity);
        await this.upsert(
          table,
          { id: change.id, ...change.row } as { id: string; updatedAt: string } & Record<string, unknown>,
          change.clocks ?? {},
        );
      }

      // Notre prochaine modification doit être plus récente que tout ce que le serveur nous a montré.
      if (maxClock) await this.db.setMeta(META.hlc, receiveHlc(await this.loadHlc(), maxClock, this.now().getTime()));
      await this.db.setMeta(META.cursor, cursor);
      await this.db.setMeta(META.epoch, epoch);
    });
  }

  private tableFor(
    entity: SyncChange['entity'],
  ): Table<Stored<{ id: string; createdAt: string; updatedAt: string }>, string> {
    const tables = {
      goals: this.db.goals,
      milestones: this.db.milestones,
      goal_readings: this.db.readings,
      event_series: this.db.series,
      events: this.db.events,
      tasks: this.db.tasks,
    };
    return tables[entity] as unknown as Table<Stored<{ id: string; createdAt: string; updatedAt: string }>, string>;
  }

  private async upsert(
    table: Table<Stored<{ id: string; updatedAt: string }>, string>,
    row: { id: string; updatedAt: string } & Record<string, unknown>,
    clocks: Record<string, string>,
  ): Promise<void> {
    const local = await table.get(row.id);
    if (!local) {
      await table.put({ ...row, _c: { ...clocks } } as Stored<{ id: string; updatedAt: string }>);
      return;
    }
    const next = { ...local } as Record<string, unknown> & Stored<{ id: string; updatedAt: string }>;
    const _c = { ...local._c };
    let changed = false;
    for (const [field, value] of Object.entries(row)) {
      if (SYSTEM.has(field)) continue;
      const server = clocks[field] ?? '';
      const mine = local._c[field] ?? '';
      // Horloge du serveur plus récente : on prend sa valeur. Sans horloge des deux côtés : celle du serveur.
      if (server > mine || (server === '' && mine === '' && JSON.stringify(value) !== JSON.stringify(next[field]))) {
        next[field] = value;
        if (server) _c[field] = server;
        changed = true;
      }
    }
    if (changed) next.updatedAt = row.updatedAt;
    next._c = _c;
    await table.put(next);
  }
}
