import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { formatHlc } from '../../../shared/src/hlc.ts';
import { prisma } from '../../src/core/prisma.ts';
import { app, goalPayload, registerUser, resetDb, type TestUser } from '../helpers.ts';

// Spec 007, phase 1 : protocole de synchronisation côté serveur.
const PROTOCOL = { 'X-Objectiva-Protocol': '1' };

const clock = (wall: number, node = 'phone-a', counter = 0) => formatHlc({ wall, counter, node });

interface Fields {
  [k: string]: unknown;
}

function mutation(op: 'create' | 'update' | 'delete', entity: string, id: string, fields: Fields | undefined, wall: number, node = 'phone-a') {
  return {
    mutationId: randomUUID(),
    entity,
    id,
    op,
    ...(fields ? { fields, clocks: Object.fromEntries(Object.keys(fields).map((k) => [k, clock(wall, node)])) } : {}),
    ...(op === 'create' ? { createdAt: '2026-11-04T09:00:00.000Z' } : {}),
  };
}

const goalFields = (over: Fields = {}): Fields => ({
  title: 'Présenter EcoleSaaS',
  description: null,
  motivation: null,
  category: 'CARRIERE',
  horizon: 'ANNEE',
  startDate: '2026-10-01',
  endDate: '2027-06-30',
  priority: 'HAUTE',
  status: 'EN_COURS',
  progressMode: 'JALONS',
  measureUnit: null,
  startValue: null,
  targetValue: null,
  ...over,
});

const taskFields = (over: Fields = {}): Fields => ({
  goalId: null,
  milestoneId: null,
  eventId: null,
  eventRole: null,
  title: 'Préparer les comptes',
  notes: null,
  workDate: '2026-11-04',
  dueDate: null,
  status: 'TODO',
  completedAt: null,
  originalDate: '2026-11-04',
  rescheduleCount: 0,
  ...over,
});

const push = (u: TestUser, mutations: object[], deviceId = 'phone-a') =>
  request(app).post('/api/sync/push').set('Authorization', `Bearer ${u.token}`).set(PROTOCOL).send({ deviceId, mutations });
const pull = (u: TestUser, cursor = 0, limit = 200) =>
  request(app).get(`/api/sync/pull?cursor=${cursor}&limit=${limit}`).set('Authorization', `Bearer ${u.token}`).set(PROTOCOL);

const statuses = (res: request.Response): string[] => res.body.data.results.map((r: { status: string }) => r.status);
const reasons = (res: request.Response): (string | undefined)[] => res.body.data.results.map((r: { reason?: string }) => r.reason);

let alice: TestUser;
let bob: TestUser;
beforeEach(async () => {
  await resetDb();
  alice = await registerUser('Alice');
  bob = await registerUser('Bob');
});

describe('protocole et accès', () => {
  it('exige l’authentification et la version du protocole (426 sinon)', async () => {
    expect((await request(app).post('/api/sync/push').set(PROTOCOL).send({})).status).toBe(401);
    expect((await request(app).get('/api/sync/pull').set(PROTOCOL)).status).toBe(401);
    const noHeader = await request(app).get('/api/sync/pull').set('Authorization', `Bearer ${alice.token}`);
    expect(noHeader.status).toBe(426);
    expect(noHeader.body.code).toBe('UPGRADE_REQUIRED');
    const tooNew = await request(app).get('/api/sync/pull').set('Authorization', `Bearer ${alice.token}`).set('X-Objectiva-Protocol', '9');
    expect(tooNew.status).toBe(426);
    expect((await pull(alice)).status).toBe(200);
  });

  it('refuse un envoi mal formé ou trop gros', async () => {
    expect((await push(alice, [])).status).toBe(400);
    expect((await push(alice, [{ nope: 1 }])).status).toBe(400);
    const many = Array.from({ length: 201 }, () => mutation('delete', 'tasks', randomUUID(), undefined, 1));
    const res = await push(alice, many);
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toContain('200 modifications');
    expect((await push(alice, many.slice(0, 200))).status).toBe(200);
  });

  it('renvoie l’époque du serveur', async () => {
    const meta = (await request(app).get('/api/meta')).body.data;
    expect((await pull(alice)).body.data.epoch).toBe(meta.epoch);
    expect((await push(alice, [mutation('delete', 'tasks', randomUUID(), undefined, 1)])).body.data.epoch).toBe(meta.epoch);
  });
});

describe('création, lecture et idempotence', () => {
  it('crée des données avec les identifiants de l’appareil, puis les renvoie avec leurs horloges', async () => {
    const goal = randomUUID();
    const milestone = randomUUID();
    const reading = randomUUID();
    const task = randomUUID();
    const res = await push(alice, [
      mutation('create', 'goals', goal, goalFields({ progressMode: 'MESURE', measureUnit: 'démonstrations', startValue: 0, targetValue: 3 }), 1000),
      mutation('create', 'milestones', milestone, { goalId: goal, title: 'Première démonstration', dueDate: '2026-11-20', completedAt: null }, 1001),
      mutation('create', 'goal_readings', reading, { goalId: goal, value: 1, readOn: '2026-11-03', note: 'Collège' }, 1002),
      mutation('create', 'tasks', task, taskFields({ goalId: goal, milestoneId: milestone }), 1003),
    ]);
    expect(res.status).toBe(200);
    expect(statuses(res)).toEqual(['applied', 'applied', 'applied', 'applied']);

    // L'API REST voit les mêmes données (même base, mêmes règles de calcul).
    expect((await alice.get(`/api/goals/${goal}`)).body.data).toMatchObject({
      title: 'Présenter EcoleSaaS',
      progress: { mode: 'MESURE', current: 1, percent: 33, label: '1 sur 3 démonstrations' },
    });
    expect((await alice.get(`/api/tasks/${task}`)).body.data).toMatchObject({ goalId: goal, milestoneId: milestone, title: 'Préparer les comptes' });

    const out = (await pull(alice)).body.data;
    expect(out.hasMore).toBe(false);
    expect(out.changes.map((c: { entity: string }) => c.entity)).toEqual(['goals', 'milestones', 'goal_readings', 'tasks']);
    const versions = out.changes.map((c: { version: number }) => c.version);
    expect([...versions].sort((a, b) => a - b)).toEqual(versions);
    expect(out.cursor).toBe(versions[versions.length - 1]);
    const goalChange = out.changes[0];
    expect(goalChange).toMatchObject({ op: 'upsert', id: goal, row: { title: 'Présenter EcoleSaaS', createdAt: '2026-11-04T09:00:00.000Z' } });
    expect(goalChange.clocks.title).toBe(clock(1000));
  });

  it('rejouer un envoi ne change rien et renvoie les mêmes résultats', async () => {
    const task = randomUUID();
    const batch = [mutation('create', 'tasks', task, taskFields(), 1000), mutation('update', 'tasks', task, { title: 'Renommée' }, 1001)];
    const first = await push(alice, batch);
    const versionAfterFirst = (await pull(alice)).body.data.cursor;
    const again = await push(alice, batch);
    expect(statuses(again)).toEqual(statuses(first));
    expect(again.body.data.results).toEqual(first.body.data.results);
    expect(await prisma.task.count({ where: { userId: alice.user.id } })).toBe(1);
    expect((await pull(alice)).body.data.cursor).toBe(versionAfterFirst);
    expect((await alice.get(`/api/tasks/${task}`)).body.data.title).toBe('Renommée');
  });

  it('une création reçue pour une ligne déjà présente est fusionnée champ par champ (identifiants calculés)', async () => {
    const task = randomUUID();
    await push(alice, [mutation('create', 'tasks', task, taskFields(), 1000)]);
    // Plus ancienne : rien ne change.
    const older = await push(alice, [mutation('create', 'tasks', task, taskFields({ title: 'Plus ancienne' }), 500)]);
    expect(statuses(older)).toEqual(['ignored']);
    expect(reasons(older)).toEqual(['stale']);
    expect((await alice.get(`/api/tasks/${task}`)).body.data.title).toBe('Préparer les comptes');
    // Plus récente : ses valeurs l'emportent, sans doublon.
    const newer = await push(alice, [mutation('create', 'tasks', task, taskFields({ title: 'Plus récente' }), 2000)]);
    expect(statuses(newer)).toEqual(['applied']);
    expect((await alice.get(`/api/tasks/${task}`)).body.data.title).toBe('Plus récente');
    expect(await prisma.task.count({ where: { userId: alice.user.id } })).toBe(1);
  });

  it('un même numéro de modification chez deux utilisateurs reste indépendant', async () => {
    const shared = mutation('create', 'tasks', randomUUID(), taskFields(), 1000);
    expect(statuses(await push(alice, [shared]))).toEqual(['applied']);
    expect(statuses(await push(bob, [{ ...shared, id: randomUUID() }]))).toEqual(['applied']);
  });
});

describe('modifications : le plus récent gagne, champ par champ', () => {
  it('applique la modification la plus récente et ignore la plus ancienne', async () => {
    const task = randomUUID();
    await push(alice, [mutation('create', 'tasks', task, taskFields({ title: 'V1' }), 1000)]);
    expect(statuses(await push(alice, [mutation('update', 'tasks', task, { title: 'V3' }, 3000)]))).toEqual(['applied']);
    const stale = await push(alice, [mutation('update', 'tasks', task, { title: 'V2' }, 2000)]);
    expect(statuses(stale)).toEqual(['ignored']);
    expect(reasons(stale)).toEqual(['stale']);
    expect((await alice.get(`/api/tasks/${task}`)).body.data.title).toBe('V3');
  });

  it('converge quel que soit l’ordre d’arrivée des modifications de deux appareils', async () => {
    const a = randomUUID();
    const b = randomUUID();
    for (const id of [a, b]) await push(alice, [mutation('create', 'tasks', id, taskFields({ title: 'Base' }), 1000)]);
    const fromPhone = (id: string) => mutation('update', 'tasks', id, { title: 'Téléphone', notes: 'note du téléphone' }, 5000, 'phone-a');
    const fromWeb = (id: string) => mutation('update', 'tasks', id, { title: 'Navigateur', workDate: '2026-11-09' }, 6000, 'web-b');

    await push(alice, [fromPhone(a)], 'phone-a');
    await push(alice, [fromWeb(a)], 'web-b');
    await push(alice, [fromWeb(b)], 'web-b');
    await push(alice, [fromPhone(b)], 'phone-a');

    const expected = { title: 'Navigateur', notes: 'note du téléphone', workDate: '2026-11-09' };
    expect((await alice.get(`/api/tasks/${a}`)).body.data).toMatchObject(expected);
    expect((await alice.get(`/api/tasks/${b}`)).body.data).toMatchObject(expected);
  });

  it('départage deux modifications de même instant par le compteur, puis par l’appareil', async () => {
    const task = randomUUID();
    await push(alice, [mutation('create', 'tasks', task, taskFields(), 1000)]);
    const withCounter = (n: number, node: string, title: string) => ({
      ...mutation('update', 'tasks', task, { title }, 0),
      clocks: { title: clock(7000, node, n) },
    });
    await push(alice, [withCounter(1, 'phone-a', 'premier')]);
    await push(alice, [withCounter(2, 'phone-a', 'deuxième')]);
    await push(alice, [withCounter(2, 'phone-a', 'rejoué sans effet')]);
    expect((await alice.get(`/api/tasks/${task}`)).body.data.title).toBe('deuxième');
    await push(alice, [withCounter(2, 'zzz-device', 'même compteur, appareil supérieur')]);
    expect((await alice.get(`/api/tasks/${task}`)).body.data.title).toBe('même compteur, appareil supérieur');
  });

  it('une donnée créée par l’API REST (sans horloge) cède devant toute modification d’un appareil', async () => {
    const created = (await alice.post('/api/tasks', { title: 'Créée par REST' })).body.data;
    const res = await push(alice, [mutation('update', 'tasks', created.id, { title: 'Modifiée hors connexion' }, 1)]);
    expect(statuses(res)).toEqual(['applied']);
    expect((await alice.get(`/api/tasks/${created.id}`)).body.data.title).toBe('Modifiée hors connexion');
  });
});

describe('suppressions', () => {
  it('la suppression l’emporte : plus de modification, plus de recréation', async () => {
    const task = randomUUID();
    await push(alice, [mutation('create', 'tasks', task, taskFields(), 1000)]);
    const del = await push(alice, [mutation('delete', 'tasks', task, undefined, 2000)]);
    expect(statuses(del)).toEqual(['applied']);
    expect((await alice.get(`/api/tasks/${task}`)).status).toBe(404);

    const edit = await push(alice, [mutation('update', 'tasks', task, { title: 'Tard' }, 99_999)]);
    expect([statuses(edit), reasons(edit)]).toEqual([['ignored'], ['deleted']]);
    const again = await push(alice, [mutation('create', 'tasks', task, taskFields(), 99_999)]);
    expect([statuses(again), reasons(again)]).toEqual([['ignored'], ['deleted']]);
    expect(statuses(await push(alice, [mutation('delete', 'tasks', task, undefined, 3000)]))).toEqual(['ignored']);
  });

  it('une suppression arrive aux autres appareils sous forme de pierre tombale', async () => {
    const task = randomUUID();
    await push(alice, [mutation('create', 'tasks', task, taskFields(), 1000)]);
    const cursor = (await pull(alice)).body.data.cursor;
    await alice.del(`/api/tasks/${task}`); // suppression faite par l'API REST
    const out = (await pull(alice, cursor)).body.data;
    expect(out.changes).toEqual([{ entity: 'tasks', op: 'delete', id: task, version: expect.any(Number) }]);
  });

  it('supprimer un objectif supprime ses jalons et relevés (pierres tombales) et détache ses tâches', async () => {
    const [goal, milestone, reading, task] = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
    await push(alice, [
      mutation('create', 'goals', goal, goalFields({ progressMode: 'MESURE', measureUnit: 'km', startValue: 0, targetValue: 10 }), 1000),
      mutation('create', 'milestones', milestone, { goalId: goal, title: 'J', dueDate: null, completedAt: null }, 1001),
      mutation('create', 'goal_readings', reading, { goalId: goal, value: 2, readOn: '2026-11-01', note: null }, 1002),
      mutation('create', 'tasks', task, taskFields({ goalId: goal, milestoneId: milestone }), 1003),
    ]);
    const cursor = (await pull(alice)).body.data.cursor;
    await push(alice, [mutation('delete', 'goals', goal, undefined, 2000)]);
    const out = (await pull(alice, cursor)).body.data;
    const deleted = out.changes.filter((c: { op: string }) => c.op === 'delete').map((c: { entity: string }) => c.entity).sort();
    expect(deleted).toEqual(['goal_readings', 'goals', 'milestones']);
    const detached = out.changes.find((c: { entity: string; op: string }) => c.entity === 'tasks' && c.op === 'upsert');
    expect(detached.row).toMatchObject({ id: task, goalId: null, milestoneId: null });
  });
});

describe('validation et références', () => {
  it('refuse sans rien écrire : champ inconnu, horloge absente, valeur invalide, enum inconnu', async () => {
    const id = randomUUID();
    const bad = [
      mutation('create', 'tasks', id, { ...taskFields(), couleur: 'rouge' }, 1000),
      { ...mutation('create', 'tasks', randomUUID(), taskFields(), 1000), clocks: {} },
      mutation('create', 'tasks', randomUUID(), taskFields({ title: '' }), 1000),
      mutation('create', 'tasks', randomUUID(), taskFields({ status: 'FAIT' }), 1000),
      mutation('create', 'tasks', randomUUID(), taskFields({ rescheduleCount: -1 }), 1000),
      mutation('create', 'tasks', randomUUID(), taskFields({ workDate: '31/12/2026' }), 1000),
      mutation('create', 'tasks', randomUUID(), { title: 'Incomplet' }, 1000),
      mutation('update', 'tasks', id, { title: 'x'.repeat(161) }, 1000),
    ];
    const res = await push(alice, bad);
    expect(statuses(res)).toEqual(bad.map(() => 'rejected'));
    expect(res.body.data.results[0].message).toMatch(/invalide/);
    expect(await prisma.task.count({ where: { userId: alice.user.id } })).toBe(0);
  });

  it('refuse un objectif incohérent (échéance avant le début, mesure incomplète)', async () => {
    const res = await push(alice, [
      mutation('create', 'goals', randomUUID(), goalFields({ startDate: '2027-01-01', endDate: '2026-01-01' }), 1000),
      mutation('create', 'goals', randomUUID(), goalFields({ progressMode: 'MESURE', measureUnit: 'km', startValue: 5, targetValue: 5 }), 1000),
      mutation('create', 'goals', randomUUID(), goalFields({ progressMode: 'MESURE' }), 1000),
    ]);
    expect(statuses(res)).toEqual(['rejected', 'rejected', 'rejected']);
    const goal = randomUUID();
    await push(alice, [mutation('create', 'goals', goal, goalFields(), 1000)]);
    const edit = await push(alice, [mutation('update', 'goals', goal, { endDate: '2020-01-01' }, 2000)]);
    expect(statuses(edit)).toEqual(['rejected']);
    expect((await alice.get(`/api/goals/${goal}`)).body.data.endDate).toBe('2027-06-30');
  });

  it('détache une tâche dont l’objectif a disparu, sans rien révéler d’un objectif étranger', async () => {
    const aliceGoal = (await alice.post('/api/goals', goalPayload)).body.data;
    const missing = randomUUID();
    const mine = randomUUID();
    const stranger = randomUUID();
    const res = await push(bob, [
      mutation('create', 'tasks', mine, taskFields({ goalId: missing }), 1000),
      mutation('create', 'tasks', stranger, taskFields({ goalId: aliceGoal.id }), 1000),
    ]);
    expect(statuses(res)).toEqual(['applied', 'applied']);
    // Même résultat pour un objectif inexistant et pour celui d'Alice : l'identifiant n'est pas conservé.
    expect((await bob.get(`/api/tasks/${mine}`)).body.data.goalId).toBeNull();
    expect((await bob.get(`/api/tasks/${stranger}`)).body.data.goalId).toBeNull();
  });

  it('le jalon impose son objectif à la tâche', async () => {
    const [g1, g2, m, t] = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
    await push(alice, [
      mutation('create', 'goals', g1, goalFields(), 1000),
      mutation('create', 'goals', g2, goalFields({ title: 'Autre' }), 1000),
      mutation('create', 'milestones', m, { goalId: g1, title: 'J', dueDate: null, completedAt: null }, 1001),
      mutation('create', 'tasks', t, taskFields({ goalId: g2, milestoneId: m }), 1002),
    ]);
    expect((await alice.get(`/api/tasks/${t}`)).body.data).toMatchObject({ goalId: g1, milestoneId: m });
  });

  it('ignore un jalon ou un relevé dont l’objectif n’existe pas (ou appartient à autrui)', async () => {
    const aliceGoal = (await alice.post('/api/goals', goalPayload)).body.data;
    const res = await push(bob, [
      mutation('create', 'milestones', randomUUID(), { goalId: randomUUID(), title: 'Orphelin', dueDate: null, completedAt: null }, 1000),
      mutation('create', 'milestones', randomUUID(), { goalId: aliceGoal.id, title: 'Intrus', dueDate: null, completedAt: null }, 1000),
      mutation('create', 'goal_readings', randomUUID(), { goalId: aliceGoal.id, value: 1, readOn: '2026-11-01', note: null }, 1000),
    ]);
    expect(statuses(res)).toEqual(['ignored', 'ignored', 'ignored']);
    expect(reasons(res)).toEqual(['parent-missing', 'parent-missing', 'parent-missing']);
    expect((await alice.get(`/api/goals/${aliceGoal.id}`)).body.data.milestones).toEqual([]);
  });
});

describe('isolation entre utilisateurs', () => {
  it('Bob ne peut ni modifier, ni supprimer, ni recréer, ni lire les données d’Alice', async () => {
    const task = randomUUID();
    await push(alice, [mutation('create', 'tasks', task, taskFields({ title: 'Privée' }), 1000)]);

    const edit = await push(bob, [mutation('update', 'tasks', task, { title: 'Piratée' }, 99_999)]);
    expect([statuses(edit), reasons(edit)]).toEqual([['rejected'], ['not-found']]);
    expect(statuses(await push(bob, [mutation('delete', 'tasks', task, undefined, 99_999)]))).toEqual(['ignored']);
    const steal = await push(bob, [mutation('create', 'tasks', task, taskFields({ title: 'Volée' }), 99_999)]);
    expect([statuses(steal), reasons(steal)]).toEqual([['rejected'], ['conflict']]);

    expect((await alice.get(`/api/tasks/${task}`)).body.data.title).toBe('Privée');
    expect((await pull(bob)).body.data.changes).toEqual([]);
    expect((await pull(alice)).body.data.changes).toHaveLength(1);
  });

  it('la réponse à une tentative sur la donnée d’autrui ne distingue pas « inexistant » de « appartient à quelqu’un d’autre »', async () => {
    const task = randomUUID();
    await push(alice, [mutation('create', 'tasks', task, taskFields(), 1000)]);
    const onAlice = await push(bob, [mutation('update', 'tasks', task, { title: 'x' }, 5)]);
    const onNothing = await push(bob, [mutation('update', 'tasks', randomUUID(), { title: 'x' }, 5)]);
    expect(onAlice.body.data.results[0].reason).toBe(onNothing.body.data.results[0].reason);
    expect(onAlice.body.data.results[0].message).toBe(onNothing.body.data.results[0].message);
  });
});

describe('réception par pages', () => {
  it('parcourt tout, une seule fois, dans l’ordre, même avec plusieurs tables tronquées', async () => {
    const goal = randomUUID();
    const muts = [mutation('create', 'goals', goal, goalFields(), 1000)];
    for (let i = 0; i < 7; i++) muts.push(mutation('create', 'tasks', randomUUID(), taskFields({ title: `Tâche ${i}` }), 1001 + i));
    for (let i = 0; i < 5; i++) muts.push(mutation('create', 'milestones', randomUUID(), { goalId: goal, title: `Jalon ${i}`, dueDate: null, completedAt: null }, 2000 + i));
    await push(alice, muts);
    const doomed = randomUUID();
    await push(alice, [mutation('create', 'tasks', doomed, taskFields(), 3000), mutation('delete', 'tasks', doomed, undefined, 3001)]);

    const seen: { id: string; version: number; op: string }[] = [];
    let cursor = 0;
    let pages = 0;
    for (;;) {
      const out = (await pull(alice, cursor, 3)).body.data;
      pages += 1;
      expect(out.cursor).toBeGreaterThanOrEqual(cursor);
      for (const c of out.changes) seen.push({ id: c.id, version: c.version, op: c.op });
      cursor = out.cursor;
      if (!out.hasMore) break;
      expect(pages).toBeLessThan(50);
    }
    const versions = seen.map((s) => s.version);
    expect([...versions].sort((a, b) => a - b)).toEqual(versions);
    expect(new Set(versions).size).toBe(versions.length);
    // 1 objectif + 7 tâches + 5 jalons + la pierre tombale de la tâche supprimée (la création supprimée a disparu).
    expect(seen).toHaveLength(14);
    expect(seen.filter((s) => s.op === 'delete')).toEqual([{ id: doomed, version: expect.any(Number), op: 'delete' }]);
    expect(pages).toBeGreaterThan(3);
  });

  it('ne renvoie que ce qui a changé depuis le curseur', async () => {
    const [t1, t2] = [randomUUID(), randomUUID()];
    await push(alice, [mutation('create', 'tasks', t1, taskFields(), 1000), mutation('create', 'tasks', t2, taskFields(), 1001)]);
    const cursor = (await pull(alice)).body.data.cursor;
    expect((await pull(alice, cursor)).body.data).toMatchObject({ changes: [], hasMore: false, cursor });
    await push(alice, [mutation('update', 'tasks', t2, { title: 'Changée' }, 2000)]);
    const out = (await pull(alice, cursor)).body.data;
    expect(out.changes.map((c: { id: string }) => c.id)).toEqual([t2]);
    expect(out.changes[0].row.title).toBe('Changée');
  });

  it('valide les paramètres de la lecture', async () => {
    expect((await pull(alice, -1)).status).toBe(400);
    expect((await pull(alice, 0, 0)).status).toBe(400);
    expect((await pull(alice, 0, 501)).status).toBe(400);
    expect((await pull(alice, 0, 500)).status).toBe(200);
  });
});
