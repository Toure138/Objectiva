import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { todayIn } from '../../../shared/src/dates.ts';
import { formatHlc } from '../../../shared/src/hlc.ts';
import { occurrenceId } from '../../../shared/src/recurrence.rules.ts';
import { prisma } from '../../src/core/prisma.ts';
import { app, goalPayload, registerUser, resetDb, type TestUser } from '../helpers.ts';

// Spec 012 : habitudes (ce que le scénario de parité ne couvre pas : isolation, synchronisation).

let alice: TestUser;
let bob: TestUser;
let today: string;

beforeEach(async () => {
  await resetDb();
  alice = await registerUser('Alice');
  bob = await registerUser('Bob');
  today = todayIn('Africa/Abidjan');
});

const daily = { title: 'Lire', kind: 'JOURS', weekdays: [1, 2, 3, 4, 5, 6, 7] };

describe('habitudes : isolation', () => {
  it('l’habitude d’autrui est introuvable sur toutes les routes ; son objectif aussi', async () => {
    const goal = (await alice.post('/api/goals', goalPayload)).body.data;
    const h = (await alice.post('/api/habits', { ...daily, goalId: goal.id })).body.data;
    await alice.post(`/api/habits/${h.id}/check`);
    const url = `/api/habits/${h.id}`;
    expect((await bob.get(url)).status).toBe(404);
    expect((await bob.patch(url, { title: 'Piraté' })).status).toBe(404);
    expect((await bob.del(url)).status).toBe(404);
    for (const action of ['check', 'uncheck', 'pause', 'resume', 'archive', 'unarchive']) {
      expect((await bob.post(`${url}/${action}`)).status, action).toBe(404);
    }
    expect((await bob.get('/api/habits')).body.data).toEqual([]);
    expect((await bob.get('/api/today')).body.data.habits).toEqual([]);
    expect((await bob.post('/api/habits', { ...daily, goalId: goal.id })).status).toBe(404);
    // Reprendre l'identifiant d'autrui : refus uniforme.
    expect((await bob.post('/api/habits', { ...daily, id: h.id })).status).toBe(409);
    expect((await alice.get(url)).body.data).toMatchObject({ title: 'Lire', doneToday: true, goalId: goal.id });
  });

  it('supprimer l’objectif garde l’habitude, sans objectif ; supprimer l’habitude efface ses jours', async () => {
    const goal = (await alice.post('/api/goals', goalPayload)).body.data;
    const h = (await alice.post('/api/habits', { ...daily, goalId: goal.id })).body.data;
    await alice.post(`/api/habits/${h.id}/check`);
    await alice.del(`/api/goals/${goal.id}`);
    expect((await alice.get(`/api/habits/${h.id}`)).body.data.goalId).toBeNull();
    await alice.del(`/api/habits/${h.id}`);
    expect(await prisma.habitCheck.count()).toBe(0);
  });

  it('cocher deux fois le même jour (double appui) ne crée qu’une ligne', async () => {
    const h = (await alice.post('/api/habits', daily)).body.data;
    await Promise.all([alice.post(`/api/habits/${h.id}/check`), alice.post(`/api/habits/${h.id}/check`)]);
    expect(await prisma.habitCheck.count({ where: { habitId: h.id } })).toBe(1);
    expect((await alice.get(`/api/habits/${h.id}`)).body.data.doneToday).toBe(true);
  });
});

// ---------------------------------------------------------------------------------------------

const PROTOCOL = { 'X-Objectiva-Protocol': '3' };
const clock = (wall: number, node: string) => formatHlc({ wall, counter: 0, node });

function mutation(op: 'create' | 'update' | 'delete', entity: string, id: string, fields: Record<string, unknown> | undefined, wall: number, node = 'phone-a') {
  return {
    mutationId: randomUUID(),
    entity,
    id,
    op,
    ...(fields ? { fields, clocks: Object.fromEntries(Object.keys(fields).map((k) => [k, clock(wall, node)])) } : {}),
    ...(op === 'create' ? { createdAt: '2026-11-04T09:00:00.000Z' } : {}),
  };
}
const habitFields = (over: Record<string, unknown> = {}) => ({
  goalId: null,
  title: 'Sport',
  rules: [{ from: '2026-11-02', kind: 'SEMAINE', weekdays: [], timesPerWeek: 3 }],
  pauses: [],
  status: 'ACTIVE',
  startDate: '2026-11-02',
  ...over,
});
const push = (u: TestUser, mutations: object[], headers = PROTOCOL) =>
  request(app).post('/api/sync/push').set('Authorization', `Bearer ${u.token}`).set(headers).send({ deviceId: 'phone-a', mutations });
const pullEntities = async (u: TestUser, protocol: string) =>
  (await request(app).get('/api/sync/pull?cursor=0').set('Authorization', `Bearer ${u.token}`).set({ 'X-Objectiva-Protocol': protocol })).body.data.changes.map(
    (c: { entity: string }) => c.entity,
  );

describe('habitudes : synchronisation', () => {
  it('deux téléphones cochent le même jour hors ligne : une seule ligne ; décocher plus tard l’emporte', async () => {
    const id = randomUUID();
    const day = occurrenceId(id, '2026-11-03');
    await push(alice, [
      mutation('create', 'habits', id, habitFields(), 1000),
      mutation('create', 'habit_checks', day, { habitId: id, date: '2026-11-03', done: true }, 1000),
    ]);
    const b = await push(alice, [mutation('create', 'habit_checks', day, { habitId: id, date: '2026-11-03', done: true }, 1500, 'phone-b')]);
    expect(b.body.data.results[0].status).toBe('applied');
    expect(await prisma.habitCheck.count({ where: { habitId: id } })).toBe(1);
    await push(alice, [mutation('update', 'habit_checks', day, { done: false }, 2000, 'phone-b')]);
    expect((await prisma.habitCheck.findUniqueOrThrow({ where: { id: day } })).done).toBe(false);
  });

  it('habitude supprimée ailleurs : un jour coché envoyé ensuite est ignoré', async () => {
    const id = randomUUID();
    await push(alice, [mutation('create', 'habits', id, habitFields(), 1000)]);
    await push(alice, [mutation('delete', 'habits', id, undefined, 2000)]);
    const late = await push(alice, [mutation('create', 'habit_checks', occurrenceId(id, '2026-11-03'), { habitId: id, date: '2026-11-03', done: true }, 1500, 'phone-b')]);
    expect(late.body.data.results[0]).toMatchObject({ status: 'ignored', reason: 'parent-missing' });
  });

  it('refuse une habitude invalide ; l’habitude d’autrui n’est jamais touchée', async () => {
    const bad = await push(alice, [mutation('create', 'habits', randomUUID(), habitFields({ rules: [] }), 1000)]);
    expect(bad.body.data.results[0].status).toBe('rejected');
    const id = randomUUID();
    await push(alice, [mutation('create', 'habits', id, habitFields(), 1000)]);
    const res = await push(bob, [
      mutation('update', 'habits', id, { title: 'Piraté' }, 9000, 'phone-bob'),
      mutation('create', 'habit_checks', occurrenceId(id, '2026-11-03'), { habitId: id, date: '2026-11-03', done: true }, 9000, 'phone-bob'),
    ]);
    expect(res.body.data.results.map((r: { status: string; reason?: string }) => `${r.status}:${r.reason}`)).toEqual(['rejected:not-found', 'ignored:parent-missing']);
    expect((await prisma.habit.findUniqueOrThrow({ where: { id } })).title).toBe('Sport');
  });

  it('une application en version 2 ne reçoit pas les habitudes ; en version 3, si', async () => {
    const h = (await alice.post('/api/habits', daily)).body.data;
    await alice.post(`/api/habits/${h.id}/check`, { date: today });
    expect(await pullEntities(alice, '2')).not.toContain('habits');
    expect(await pullEntities(alice, '3')).toEqual(expect.arrayContaining(['habits', 'habit_checks']));
  });
});
