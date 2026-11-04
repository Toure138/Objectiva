import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../../src/core/prisma.ts';
import { goalPayload, registerUser, resetDb, type TestUser } from '../helpers.ts';

// Spec 007, phase 0 : l'appareil crée ses propres identifiants (indispensable hors connexion).
let alice: TestUser;
let bob: TestUser;

beforeEach(async () => {
  await resetDb();
  alice = await registerUser('Alice');
  bob = await registerUser('Bob');
});

describe('identifiants fournis par l’appareil', () => {
  it('sont conservés à la création de chaque type de donnée', async () => {
    const ids = Object.fromEntries(
      ['goal', 'milestone', 'reading', 'task', 'event', 'account', 'category', 'operation', 'transaction'].map((k) => [k, randomUUID()]),
    ) as Record<string, string>;

    const goal = await alice.post('/api/goals', {
      ...goalPayload,
      id: ids['goal'],
      progressMode: 'MESURE',
      measureUnit: 'démonstrations',
      startValue: 0,
      targetValue: 3,
    });
    expect(goal.status).toBe(201);
    expect(goal.body.data.id).toBe(ids['goal']);
    expect((await alice.post(`/api/goals/${ids['goal']}/milestones`, { id: ids['milestone'], title: 'Jalon' })).body.data.id).toBe(ids['milestone']);
    expect((await alice.post(`/api/goals/${ids['goal']}/readings`, { id: ids['reading'], value: 1 })).body.data.reading.id).toBe(ids['reading']);
    expect((await alice.post('/api/tasks', { id: ids['task'], title: 'Tâche', goalId: ids['goal'] })).body.data.id).toBe(ids['task']);
    expect(
      (await alice.post('/api/events', { id: ids['event'], type: 'APPEL', title: 'Appel', date: '2026-12-01', startTime: '10:00', endTime: '10:30' })).body.data.id,
    ).toBe(ids['event']);

    expect((await alice.post('/api/budget/accounts', { id: ids['account'], name: 'Orange Money', kind: 'MOBILE_MONEY' })).body.data.id).toBe(ids['account']);
    expect((await alice.post('/api/budget/categories', { id: ids['category'], name: 'Fournitures', type: 'DEPENSE' })).body.data.id).toBe(ids['category']);
    const op = await alice.post('/api/budget/operations', {
      id: ids['operation'],
      type: 'DEPENSE',
      label: 'Impression',
      plannedAmount: 5_000,
      dueDate: '2026-12-05',
      categoryId: ids['category'],
    });
    expect(op.body.data.id).toBe(ids['operation']);
    const tx = await alice.post('/api/budget/transactions', { id: ids['transaction'], type: 'DEPENSE', amount: 1_000, date: '2026-12-05', accountId: ids['account'] });
    expect(tx.body.data.transaction.id).toBe(ids['transaction']);
  });

  it('en génère un quand l’appareil n’en fournit pas (comportement inchangé)', async () => {
    const task = (await alice.post('/api/tasks', { title: 'Sans identifiant' })).body.data;
    expect(task.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('refuse un identifiant mal formé', async () => {
    const res = await alice.post('/api/tasks', { id: 'pas-un-uuid', title: 'X' });
    expect(res.status).toBe(400);
    expect(res.body.details[0].field).toBe('id');
    expect((await alice.post('/api/goals', { ...goalPayload, id: 12345 })).status).toBe(400);
  });

  it('refuse de réutiliser un identifiant, sans écraser la donnée existante', async () => {
    const id = randomUUID();
    expect((await alice.post('/api/tasks', { id, title: 'Première' })).status).toBe(201);
    const again = await alice.post('/api/tasks', { id, title: 'Seconde' });
    expect(again.status).toBe(409);
    expect(again.body.code).toBe('CONFLICT');
    expect((await alice.get(`/api/tasks/${id}`)).body.data.title).toBe('Première');
  });

  it('ne permet jamais d’écraser ni de révéler la donnée d’un autre utilisateur', async () => {
    const id = randomUUID();
    await alice.post('/api/tasks', { id, title: 'Tâche privée d’Alice' });
    const attack = await bob.post('/api/tasks', { id, title: 'Tentative de Bob' });
    // Même réponse qu'une collision avec sa propre donnée : on ne sait pas à qui appartient l'identifiant.
    expect(attack.status).toBe(409);
    expect(attack.body.message).toBe((await alice.post('/api/tasks', { id, title: 'X' })).body.message);
    expect((await alice.get(`/api/tasks/${id}`)).body.data.title).toBe('Tâche privée d’Alice');
    expect((await bob.get(`/api/tasks/${id}`)).status).toBe(404);
    expect(await prisma.task.count({ where: { userId: bob.user.id } })).toBe(0);
  });

  it('ne permet pas de changer l’identifiant d’une donnée par modification', async () => {
    const task = (await alice.post('/api/tasks', { title: 'Stable' })).body.data;
    const res = await alice.patch(`/api/tasks/${task.id}`, { id: randomUUID(), title: 'Renommée' });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ id: task.id, title: 'Renommée' });
  });

  it('le double appui d’une création avec identifiant ne crée qu’une donnée', async () => {
    const id = randomUUID();
    const results = await Promise.all(Array.from({ length: 4 }, () => alice.post('/api/tasks', { id, title: 'Rafale' })));
    expect(results.map((r) => r.status).sort()).toEqual([201, 409, 409, 409]);
    expect(await prisma.task.count({ where: { id } })).toBe(1);
  });
});
