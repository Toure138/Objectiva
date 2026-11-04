import { isHlc } from '../../../../shared/src/hlc.ts';
import { measureProblems } from '../../../../shared/src/goals.schemas.ts';
import type {
  Mutation,
  MutationResult,
  PullResponse,
  PushRequest,
  PushResponse,
  SyncChange,
  SyncedEntity,
} from '../../../../shared/src/sync.schemas.ts';
import { FIELD_SCHEMAS } from '../../../../shared/src/sync.schemas.ts';
import { currentEpoch } from '../../core/epoch.ts';
import { prisma } from '../../core/prisma.ts';
import type { Prisma } from '../../generated/prisma/client.ts';
import { dbDay, dbInstant, goalData, taskData, toGoalRow, toMilestoneRow, toReadingRow, toTaskRow } from '../../core/repo.prisma.ts';
import { isUniqueViolation } from '../budget/budget.service.ts';

// Synchronisation (spec 007, phase 1) : le téléphone envoie ses modifications (`push`) et reçoit
// celles du serveur (`pull`). Les numéros de version et les pierres tombales sont posés par la base
// (déclencheurs) ; ici : validation, arbitrage champ par champ (horloge hybride) et idempotence.

type Tx = Prisma.TransactionClient;
type Fields = Record<string, unknown>;
type Clocks = Record<string, string>;

const MESSAGES = {
  invalid: 'Cette modification est invalide et n’a pas pu être enregistrée sur le serveur',
  notFound: 'Cette donnée n’existe plus sur le serveur',
  conflict: 'Cet identifiant est déjà utilisé',
} as const;

const asClocks = (v: unknown): Clocks => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Clocks) : {});

// ---------------------------------------------------------------------------------------------
// Accès par table

interface Stored {
  fields: Fields;
  clocks: Clocks;
}

interface Handler {
  find(tx: Tx, userId: string, id: string): Promise<Stored | null>;
  /** Vérifie les références et les cohérences entre champs ; renvoie les champs à écrire, ou un motif d'abandon. */
  prepare(tx: Tx, userId: string, id: string, merged: Fields): Promise<{ fields: Fields } | { reason: string; message: string }>;
  insert(tx: Tx, userId: string, id: string, fields: Fields, createdAt: Date, clocks: Clocks): Promise<void>;
  update(tx: Tx, userId: string, id: string, fields: Fields, clocks: Clocks): Promise<void>;
  remove(tx: Tx, userId: string, id: string): Promise<void>;
}

const strip = (row: object): Fields => {
  const { id: _id, createdAt: _c, updatedAt: _u, ...rest } = row as Fields;
  return rest;
};

const goalHandler: Handler = {
  async find(tx, userId, id) {
    const g = await tx.goal.findFirst({ where: { id, userId } });
    return g ? { fields: strip(toGoalRow(g)), clocks: asClocks(g.fieldClocks) } : null;
  },
  async prepare(_tx, _userId, _id, f) {
    if ((f['endDate'] as string) < (f['startDate'] as string)) {
      return { reason: 'invalid', message: 'L’échéance d’un objectif doit suivre sa date de début' };
    }
    const problems = measureProblems({
      progressMode: f['progressMode'] as 'JALONS' | 'MESURE',
      measureUnit: f['measureUnit'] as string | null,
      startValue: f['startValue'] as number | null,
      targetValue: f['targetValue'] as number | null,
    });
    if (problems.length > 0) return { reason: 'invalid', message: problems[0]!.message };
    return { fields: f };
  },
  async insert(tx, userId, id, f, createdAt, clocks) {
    await tx.goal.create({
      data: {
        ...(goalData(f) as Prisma.GoalUncheckedCreateInput),
        id,
        userId,
        startDate: dbDay(f['startDate'] as string)!,
        endDate: dbDay(f['endDate'] as string)!,
        createdAt,
        fieldClocks: clocks,
      },
    });
  },
  async update(tx, userId, id, f, clocks) {
    await tx.goal.update({ where: { id, userId }, data: { ...goalData(f), fieldClocks: clocks } });
  },
  async remove(tx, userId, id) {
    await tx.goal.deleteMany({ where: { id, userId } });
  },
};

const milestoneHandler: Handler = {
  async find(tx, userId, id) {
    const m = await tx.milestone.findFirst({ where: { id, userId } });
    return m ? { fields: strip(toMilestoneRow(m)), clocks: asClocks(m.fieldClocks) } : null;
  },
  async prepare(tx, userId, _id, f) {
    // Le parent supprimé ailleurs l'emporte : le jalon n'a plus d'objectif auquel se rattacher.
    if (!(await tx.goal.findFirst({ where: { id: f['goalId'] as string, userId }, select: { id: true } }))) {
      return { reason: 'parent-missing', message: 'L’objectif de ce jalon n’existe plus' };
    }
    return { fields: f };
  },
  async insert(tx, userId, id, f, createdAt, clocks) {
    await tx.milestone.create({
      data: {
        id,
        userId,
        goalId: f['goalId'] as string,
        title: f['title'] as string,
        dueDate: dbDay(f['dueDate'] as string | null),
        completedAt: dbInstant(f['completedAt'] as string | null),
        createdAt,
        fieldClocks: clocks,
      },
    });
  },
  async update(tx, userId, id, f, clocks) {
    await tx.milestone.update({
      where: { id, userId },
      data: {
        goalId: f['goalId'] as string | undefined,
        title: f['title'] as string | undefined,
        dueDate: dbDay(f['dueDate'] as string | null | undefined),
        completedAt: dbInstant(f['completedAt'] as string | null | undefined),
        fieldClocks: clocks,
      },
    });
  },
  async remove(tx, userId, id) {
    await tx.milestone.deleteMany({ where: { id, userId } });
  },
};

const readingHandler: Handler = {
  async find(tx, userId, id) {
    const r = await tx.goalReading.findFirst({ where: { id, userId } });
    return r ? { fields: strip(toReadingRow(r)), clocks: asClocks(r.fieldClocks) } : null;
  },
  async prepare(tx, userId, _id, f) {
    if (!(await tx.goal.findFirst({ where: { id: f['goalId'] as string, userId }, select: { id: true } }))) {
      return { reason: 'parent-missing', message: 'L’objectif de ce relevé n’existe plus' };
    }
    return { fields: f };
  },
  async insert(tx, userId, id, f, createdAt, clocks) {
    await tx.goalReading.create({
      data: {
        id,
        userId,
        goalId: f['goalId'] as string,
        value: f['value'] as number,
        readOn: dbDay(f['readOn'] as string)!,
        note: f['note'] as string | null,
        createdAt,
        fieldClocks: clocks,
      },
    });
  },
  async update(tx, userId, id, f, clocks) {
    await tx.goalReading.update({
      where: { id, userId },
      data: {
        goalId: f['goalId'] as string | undefined,
        value: f['value'] as number | undefined,
        readOn: dbDay(f['readOn'] as string | undefined) ?? undefined,
        note: f['note'] as string | null | undefined,
        fieldClocks: clocks,
      },
    });
  },
  async remove(tx, userId, id) {
    await tx.goalReading.deleteMany({ where: { id, userId } });
  },
};

const taskHandler: Handler = {
  async find(tx, userId, id) {
    const t = await tx.task.findFirst({ where: { id, userId } });
    return t ? { fields: strip(toTaskRow(t)), clocks: asClocks(t.fieldClocks) } : null;
  },
  async prepare(tx, userId, _id, f) {
    // Un objectif, un jalon ou un rendez-vous supprimé ailleurs détache la tâche (elle est conservée,
    // comme lors d'une suppression sur le serveur) ; le jalon impose son objectif.
    const out = { ...f };
    const milestoneId = out['milestoneId'] as string | null;
    if (milestoneId) {
      const m = await tx.milestone.findFirst({ where: { id: milestoneId, userId }, select: { goalId: true } });
      if (m) out['goalId'] = m.goalId;
      else out['milestoneId'] = null;
    }
    const goalId = out['goalId'] as string | null;
    if (goalId && !(await tx.goal.findFirst({ where: { id: goalId, userId }, select: { id: true } }))) {
      out['goalId'] = null;
      out['milestoneId'] = null;
    }
    const eventId = out['eventId'] as string | null;
    if (eventId && !(await tx.event.findFirst({ where: { id: eventId, userId }, select: { id: true } }))) {
      out['eventId'] = null;
      out['eventRole'] = null;
    }
    return { fields: out };
  },
  async insert(tx, userId, id, f, createdAt, clocks) {
    await tx.task.create({
      data: { ...(taskData(f) as Prisma.TaskUncheckedCreateInput), id, userId, createdAt, fieldClocks: clocks },
    });
  },
  async update(tx, userId, id, f, clocks) {
    await tx.task.update({ where: { id, userId }, data: { ...taskData(f), fieldClocks: clocks } });
  },
  async remove(tx, userId, id) {
    await tx.task.deleteMany({ where: { id, userId } });
  },
};

const HANDLERS: Record<SyncedEntity, Handler> = {
  goals: goalHandler,
  milestones: milestoneHandler,
  goal_readings: readingHandler,
  tasks: taskHandler,
};

// ---------------------------------------------------------------------------------------------
// Envoi (push)

const rejected = (m: Mutation, reason: string, message: string): MutationResult => ({ mutationId: m.mutationId, status: 'rejected', reason, message });
const ignored = (m: Mutation, reason: string): MutationResult => ({ mutationId: m.mutationId, status: 'ignored', reason });
const applied = (m: Mutation): MutationResult => ({ mutationId: m.mutationId, status: 'applied' });

async function isDeleted(tx: Tx, userId: string, entity: SyncedEntity, id: string): Promise<boolean> {
  return (await tx.tombstone.count({ where: { userId, entity, entityId: id } })) > 0;
}

/** Les champs et leurs horloges doivent correspondre un à un. */
function clocksComplete(fields: Fields, clocks: Clocks | undefined): clocks is Clocks {
  if (!clocks) return false;
  const keys = Object.keys(fields);
  return keys.length === Object.keys(clocks).length && keys.every((k) => isHlc(clocks[k]));
}

async function apply(tx: Tx, userId: string, m: Mutation): Promise<MutationResult> {
  const handler = HANDLERS[m.entity];
  const schema = FIELD_SCHEMAS[m.entity];

  if (m.op === 'delete') {
    // La suppression l'emporte sur toute modification ; supprimer ce qui n'existe plus n'est pas une erreur.
    const existing = await handler.find(tx, userId, m.id);
    if (!existing) return ignored(m, 'deleted');
    await handler.remove(tx, userId, m.id);
    return applied(m);
  }

  const raw = m.fields ?? {};
  if (!clocksComplete(raw, m.clocks) || Object.keys(raw).length === 0) {
    return rejected(m, 'invalid', MESSAGES.invalid);
  }

  if (m.op === 'create') {
    const parsed = schema.safeParse(raw);
    if (!parsed.success) return rejected(m, 'invalid', MESSAGES.invalid);
    if (await isDeleted(tx, userId, m.entity, m.id)) return ignored(m, 'deleted');
    if (await handler.find(tx, userId, m.id)) return ignored(m, 'exists');
    const prepared = await handler.prepare(tx, userId, m.id, parsed.data as Fields);
    if ('reason' in prepared) return prepared.reason === 'parent-missing' ? ignored(m, prepared.reason) : rejected(m, prepared.reason, prepared.message);
    await handler.insert(tx, userId, m.id, prepared.fields, m.createdAt ? new Date(m.createdAt) : new Date(), m.clocks!);
    return applied(m);
  }

  // Modification : champ par champ, la valeur dont l'horloge est la plus récente l'emporte.
  const parsed = schema.partial().safeParse(raw);
  if (!parsed.success) return rejected(m, 'invalid', MESSAGES.invalid);
  const existing = await handler.find(tx, userId, m.id);
  if (!existing) return (await isDeleted(tx, userId, m.entity, m.id)) ? ignored(m, 'deleted') : rejected(m, 'not-found', MESSAGES.notFound);

  const accepted: Fields = {};
  const newClocks: Clocks = { ...existing.clocks };
  for (const [field, value] of Object.entries(parsed.data as Fields)) {
    const clock = m.clocks![field]!;
    const stored = existing.clocks[field];
    if (stored === undefined || clock > stored) {
      accepted[field] = value;
      newClocks[field] = clock;
    }
  }
  if (Object.keys(accepted).length === 0) return ignored(m, 'stale');

  const prepared = await handler.prepare(tx, userId, m.id, { ...existing.fields, ...accepted });
  if ('reason' in prepared) return prepared.reason === 'parent-missing' ? ignored(m, prepared.reason) : rejected(m, prepared.reason, prepared.message);
  // La préparation a pu normaliser des références (parent supprimé) : on écrit ces champs aussi.
  const toWrite: Fields = { ...accepted };
  for (const key of Object.keys(prepared.fields)) {
    if (JSON.stringify(prepared.fields[key]) !== JSON.stringify(existing.fields[key])) toWrite[key] = prepared.fields[key];
  }
  await handler.update(tx, userId, m.id, toWrite, newClocks);
  return applied(m);
}

async function remember(db: Tx | typeof prisma, userId: string, r: MutationResult): Promise<void> {
  await db.syncMutation.upsert({
    where: { userId_mutationId: { userId, mutationId: r.mutationId } },
    create: { userId, mutationId: r.mutationId, status: r.status, reason: r.reason ?? null, message: r.message ?? null },
    update: {},
  });
}

async function processOne(userId: string, m: Mutation): Promise<MutationResult> {
  const done = await prisma.syncMutation.findUnique({ where: { userId_mutationId: { userId, mutationId: m.mutationId } } });
  if (done) {
    return { mutationId: m.mutationId, status: done.status as MutationResult['status'], reason: done.reason ?? undefined, message: done.message ?? undefined };
  }
  try {
    return await prisma.$transaction(async (tx) => {
      const result = await apply(tx, userId, m);
      await remember(tx, userId, result);
      return result;
    });
  } catch (e) {
    // Identifiant déjà pris (par une donnée d'un autre utilisateur, ou concurrente) : refus uniforme.
    if (isUniqueViolation(e)) {
      const result = rejected(m, 'conflict', MESSAGES.conflict);
      await remember(prisma, userId, result);
      return result;
    }
    throw e;
  }
}

/** Applique les modifications dans l'ordre. Un refus n'arrête pas les suivantes ; chaque résultat est mémorisé. */
export async function push(userId: string, req: PushRequest): Promise<PushResponse> {
  const results: MutationResult[] = [];
  for (const m of req.mutations) results.push(await processOne(userId, m));
  return { epoch: await currentEpoch(), results };
}

// ---------------------------------------------------------------------------------------------
// Réception (pull)

interface Source {
  entity: SyncedEntity;
  rows: { version: number; change: SyncChange }[];
  truncated: boolean;
}

const num = (v: bigint): number => Number(v);

/**
 * Changements (créations, modifications, suppressions) survenus après `cursor`, par numéro de version
 * croissant. Chaque table est lue séparément ; on ne renvoie que ce qui est complet jusqu'à un numéro
 * « sûr », pour ne jamais sauter une ligne quand une page est tronquée.
 */
export async function pull(userId: string, cursor: number, limit: number): Promise<PullResponse> {
  const gt = BigInt(cursor);
  const take = limit + 1;
  const where = { userId, serverVersion: { gt } };
  const orderBy = { serverVersion: 'asc' as const };

  const [goals, milestones, readings, tasks, stones] = await Promise.all([
    prisma.goal.findMany({ where, orderBy, take }),
    prisma.milestone.findMany({ where, orderBy, take }),
    prisma.goalReading.findMany({ where, orderBy, take }),
    prisma.task.findMany({ where, orderBy, take }),
    prisma.tombstone.findMany({ where: { userId, serverVersion: { gt } }, orderBy, take }),
  ]);

  const upsert = <T extends { id: string; serverVersion: bigint; fieldClocks: unknown }>(
    entity: SyncedEntity,
    rows: T[],
    toRow: (r: T) => object,
  ): Source => ({
    entity,
    truncated: rows.length > limit,
    rows: rows.map((r) => ({
      version: num(r.serverVersion),
      change: { entity, op: 'upsert', id: r.id, version: num(r.serverVersion), row: toRow(r) as Record<string, unknown>, clocks: asClocks(r.fieldClocks) },
    })),
  });

  const sources: Source[] = [
    upsert('goals', goals, toGoalRow),
    upsert('milestones', milestones, toMilestoneRow),
    upsert('goal_readings', readings, toReadingRow),
    upsert('tasks', tasks, toTaskRow),
    {
      entity: 'tasks',
      truncated: stones.length > limit,
      rows: stones
        .filter((s) => (['goals', 'milestones', 'goal_readings', 'tasks'] as string[]).includes(s.entity))
        .map((s) => ({
          version: num(s.serverVersion),
          change: { entity: s.entity as SyncedEntity, op: 'delete', id: s.entityId, version: num(s.serverVersion) },
        })),
    },
  ];

  // Une source tronquée n'est complète que jusqu'à sa `limit`-ième ligne : c'est le plafond commun.
  let ceiling = Number.POSITIVE_INFINITY;
  for (const s of sources) {
    if (s.truncated) ceiling = Math.min(ceiling, s.rows[limit - 1]!.version);
  }
  const changes = sources
    .flatMap((s) => s.rows)
    .filter((r) => r.version <= ceiling)
    .sort((a, b) => a.version - b.version)
    .map((r) => r.change);

  const hasMore = sources.some((s) => s.truncated);
  const last = changes.length > 0 ? changes[changes.length - 1]!.version : cursor;
  // Page tronquée : le curseur est le plafond commun (tout ce qui est ≤ plafond a été renvoyé).
  return { epoch: await currentEpoch(), cursor: hasMore ? ceiling : last, hasMore, changes };
}
