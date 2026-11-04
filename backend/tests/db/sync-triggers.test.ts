import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../../src/core/prisma.ts';
import { goalPayload, registerUser, resetDb, type TestUser } from '../helpers.ts';

// Spec 007, phase 0 : la base numérote chaque écriture et garde la trace de chaque suppression,
// quelle que soit la route (ou la cascade) qui en est à l'origine.
const n = (v: bigint | number) => Number(v);

let alice: TestUser;
let bob: TestUser;

beforeEach(async () => {
  await resetDb();
  alice = await registerUser('Alice');
  bob = await registerUser('Bob');
});

async function versionsOf(userId: string): Promise<number[]> {
  const tables = ['goals', 'milestones', 'goal_readings', 'tasks', 'events', 'accounts', 'budget_categories', 'envelopes', 'planned_operations', 'transactions'];
  const out: number[] = [];
  for (const t of tables) {
    const rows = await prisma.$queryRawUnsafe<{ v: bigint }[]>(`SELECT server_version AS v FROM ${t} WHERE user_id = $1::uuid`, userId);
    out.push(...rows.map((r) => n(r.v)));
  }
  return out;
}

describe('versions attribuées par la base', () => {
  it('numérote chaque écriture, sans doublon, avec un compteur par utilisateur', async () => {
    const goal = (await alice.post('/api/goals', goalPayload)).body.data;
    await alice.post(`/api/goals/${goal.id}/milestones`, { title: 'Jalon' });
    await alice.post('/api/tasks', { title: 'Tâche', goalId: goal.id });
    await bob.post('/api/tasks', { title: 'Tâche de Bob' });

    const a = await versionsOf(alice.user.id);
    expect(a).toHaveLength(3);
    expect(new Set(a).size).toBe(3);
    expect(Math.min(...a)).toBeGreaterThanOrEqual(1);
    // Le compteur d'Alice est indépendant de celui de Bob.
    expect(await versionsOf(bob.user.id)).toEqual([1]);
    const state = await prisma.syncState.findUnique({ where: { userId: alice.user.id } });
    expect(n(state!.version)).toBeGreaterThanOrEqual(Math.max(...a));
  });

  it('attribue un nouveau numéro et une nouvelle date à chaque modification', async () => {
    const task = (await alice.post('/api/tasks', { title: 'À modifier' })).body.data;
    const before = await prisma.task.findUniqueOrThrow({ where: { id: task.id } });
    await new Promise((r) => setTimeout(r, 15));
    await alice.patch(`/api/tasks/${task.id}`, { title: 'Modifiée' });
    const after = await prisma.task.findUniqueOrThrow({ where: { id: task.id } });
    expect(n(after.serverVersion)).toBeGreaterThan(n(before.serverVersion));
    expect(after.updatedAt.getTime()).toBeGreaterThan(before.updatedAt.getTime());
  });

  it('couvre aussi les écritures du budget et des événements', async () => {
    await alice.post('/api/budget/setup');
    await alice.post('/api/events', { type: 'APPEL', title: 'Appel', date: '2026-12-01', startTime: '10:00', endTime: '10:30' });
    const v = await versionsOf(alice.user.id);
    expect(v.length).toBeGreaterThanOrEqual(13); // 1 compte + 11 catégories + 1 événement
    expect(v.every((x) => x >= 1)).toBe(true);
    expect(new Set(v).size).toBe(v.length);
  });

  it('reste sans doublon quand un même utilisateur écrit en parallèle', async () => {
    const results = await Promise.all(Array.from({ length: 12 }, (_, i) => alice.post('/api/tasks', { title: `Parallèle ${i}` })));
    expect(results.every((r) => r.status === 201)).toBe(true);
    const v = await versionsOf(alice.user.id);
    expect(v).toHaveLength(12);
    expect(new Set(v).size).toBe(12);
  });
});

describe('pierres tombales', () => {
  it('garde la trace d’une suppression, avec le bon propriétaire', async () => {
    const task = (await alice.post('/api/tasks', { title: 'À supprimer' })).body.data;
    await alice.del(`/api/tasks/${task.id}`);
    const stones = await prisma.tombstone.findMany({ where: { entityId: task.id } });
    expect(stones).toHaveLength(1);
    expect(stones[0]).toMatchObject({ userId: alice.user.id, entity: 'tasks' });
    expect(n(stones[0]!.serverVersion)).toBeGreaterThan(0);
    expect(await prisma.tombstone.count({ where: { userId: bob.user.id } })).toBe(0);
  });

  it('suivit les cascades : supprimer un objectif trace ses jalons et ses relevés, et met à jour ses tâches', async () => {
    const goal = (
      await alice.post('/api/goals', { ...goalPayload, progressMode: 'MESURE', measureUnit: 'démonstrations', startValue: 0, targetValue: 3 })
    ).body.data;
    const milestone = (await alice.post(`/api/goals/${goal.id}/milestones`, { title: 'Jalon' })).body.data;
    const reading = (await alice.post(`/api/goals/${goal.id}/readings`, { value: 1 })).body.data.reading;
    const task = (await alice.post('/api/tasks', { title: 'Liée', goalId: goal.id })).body.data;
    const taskBefore = await prisma.task.findUniqueOrThrow({ where: { id: task.id } });

    await alice.del(`/api/goals/${goal.id}`);

    const stones = await prisma.tombstone.findMany({ where: { userId: alice.user.id } });
    const byEntity = Object.fromEntries(stones.map((s) => [s.entity, s.entityId]));
    expect(byEntity['goals']).toBe(goal.id);
    expect(byEntity['milestones']).toBe(milestone.id);
    expect(byEntity['goal_readings']).toBe(reading.id);
    // La tâche reste, sans objectif : sa version a avancé, un appareil absent la recevra à jour.
    const taskAfter = await prisma.task.findUniqueOrThrow({ where: { id: task.id } });
    expect(taskAfter.goalId).toBeNull();
    expect(n(taskAfter.serverVersion)).toBeGreaterThan(n(taskBefore.serverVersion));
    expect(await prisma.tombstone.count({ where: { entity: 'tasks' } })).toBe(0);
  });

  it('trace la suppression d’une transaction réelle et d’une prévision', async () => {
    const setup = (await alice.post('/api/budget/setup')).body.data;
    const cash = setup.accounts[0].id as string;
    const op = (await alice.post('/api/budget/operations', { type: 'DEPENSE', label: 'Loyer', plannedAmount: 50_000, dueDate: '2026-12-05' })).body.data;
    const paid = (await alice.post(`/api/budget/operations/${op.id}/settle`, { amount: 10_000, accountId: cash, idempotencyKey: 'cle-sync-0001' })).body.data;
    await alice.del(`/api/budget/transactions/${paid.transaction.id}`);
    await alice.del(`/api/budget/operations/${op.id}`);
    const entities = (await prisma.tombstone.findMany({ where: { userId: alice.user.id } })).map((s) => s.entity).sort();
    expect(entities).toEqual(['planned_operations', 'transactions']);
  });

  it('ne laisse rien derrière une suppression de compte (pas de trace orpheline, pas d’erreur)', async () => {
    await alice.post('/api/tasks', { title: 'Tâche' });
    const goal = (await alice.post('/api/goals', goalPayload)).body.data;
    await alice.post(`/api/goals/${goal.id}/milestones`, { title: 'Jalon' });
    await prisma.user.delete({ where: { id: alice.user.id } });
    expect(await prisma.tombstone.count({ where: { userId: alice.user.id } })).toBe(0);
    expect(await prisma.syncState.count({ where: { userId: alice.user.id } })).toBe(0);
    expect(await prisma.task.count({ where: { userId: alice.user.id } })).toBe(0);
    // Bob n'est pas touché.
    await bob.post('/api/tasks', { title: 'Toujours là' });
    expect(await prisma.task.count({ where: { userId: bob.user.id } })).toBe(1);
  });
});

describe('époque du serveur', () => {
  it('existe, et reste stable tant que personne ne la renouvelle', async () => {
    const [first] = await prisma.serverMeta.findMany();
    expect(first?.epoch).toMatch(/^[0-9a-f-]{36}$/);
    await alice.post('/api/tasks', { title: 'Écriture' });
    const [again] = await prisma.serverMeta.findMany();
    expect(again?.epoch).toBe(first?.epoch);
    expect(await prisma.serverMeta.count()).toBe(1);
  });
});
