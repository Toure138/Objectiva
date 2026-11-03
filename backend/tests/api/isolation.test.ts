import { beforeEach, describe, expect, it } from 'vitest';
import { goalPayload, registerUser, resetDb, type TestUser } from '../helpers.ts';

// CA-11 : un utilisateur ne voit, ne modifie ni ne rattache jamais les données d'un autre.
let alice: TestUser;
let bob: TestUser;
let aliceGoal: { id: string };
let aliceMilestone: { id: string };
let aliceTask: { id: string };

beforeEach(async () => {
  await resetDb();
  alice = await registerUser('Alice');
  bob = await registerUser('Bob');
  aliceGoal = (await alice.post('/api/goals', goalPayload)).body.data;
  aliceMilestone = (await alice.post(`/api/goals/${aliceGoal.id}/milestones`, { title: 'Jalon' })).body.data;
  aliceTask = (await alice.post('/api/tasks', { title: 'Tâche privée', goalId: aliceGoal.id })).body.data;
});

describe('isolation entre utilisateurs', () => {
  it('les listes ne montrent que ses propres données', async () => {
    expect((await bob.get('/api/goals')).body.data).toEqual([]);
    expect((await bob.get('/api/tasks')).body.data.total).toBe(0);
  });

  it("l'accès direct aux ressources d'autrui renvoie 404", async () => {
    expect((await bob.get(`/api/goals/${aliceGoal.id}`)).status).toBe(404);
    expect((await bob.get(`/api/tasks/${aliceTask.id}`)).status).toBe(404);
    expect((await bob.patch(`/api/goals/${aliceGoal.id}`, { title: 'Piraté' })).status).toBe(404);
    expect((await bob.patch(`/api/milestones/${aliceMilestone.id}`, { completed: true })).status).toBe(404);
    expect((await bob.post(`/api/tasks/${aliceTask.id}/complete`)).status).toBe(404);
    expect((await bob.post(`/api/tasks/${aliceTask.id}/reschedule`, { workDate: null })).status).toBe(404);
    expect((await bob.del(`/api/tasks/${aliceTask.id}`)).status).toBe(404);
    expect((await bob.del(`/api/goals/${aliceGoal.id}`)).status).toBe(404);
    expect((await bob.post(`/api/goals/${aliceGoal.id}/milestones`, { title: 'Intrus' })).status).toBe(404);
  });

  it("impossible de rattacher une tâche à l'objectif ou au jalon d'autrui", async () => {
    expect((await bob.post('/api/tasks', { title: 'X', goalId: aliceGoal.id })).status).toBe(404);
    expect((await bob.post('/api/tasks', { title: 'X', milestoneId: aliceMilestone.id })).status).toBe(404);

    const own = (await bob.post('/api/tasks', { title: 'À moi' })).body.data;
    expect((await bob.patch(`/api/tasks/${own.id}`, { goalId: aliceGoal.id })).status).toBe(404);
    expect((await bob.patch(`/api/tasks/${own.id}`, { milestoneId: aliceMilestone.id })).status).toBe(404);
  });

  it("les relevés d'un objectif mesuré sont inaccessibles à autrui (spec 003, CA-8)", async () => {
    const measured = (
      await alice.post('/api/goals', { ...goalPayload, progressMode: 'MESURE', measureUnit: 'démonstrations', startValue: 0, targetValue: 3 })
    ).body.data;
    const reading = (await alice.post(`/api/goals/${measured.id}/readings`, { value: 1 })).body.data.reading;
    expect((await bob.post(`/api/goals/${measured.id}/readings`, { value: 3 })).status).toBe(404);
    expect((await bob.del(`/api/readings/${reading.id}`)).status).toBe(404);
    expect((await bob.del('/api/readings/pas-un-uuid')).status).toBe(404);
    const intact = (await alice.get(`/api/goals/${measured.id}`)).body.data;
    expect(intact.readings).toHaveLength(1);
    expect(intact.progress.current).toBe(1);
  });

  it("les événements d'Alice sont inaccessibles à Bob (spec 004, CA-10)", async () => {
    const event = (
      await alice.post('/api/events', {
        type: 'RENDEZ_VOUS',
        title: 'Rendez-vous privé',
        date: '2026-12-01',
        startTime: '10:00',
        endTime: '11:00',
        goalId: aliceGoal.id,
      })
    ).body.data;
    const url = `/api/events/${event.id}`;
    expect((await bob.get('/api/events')).body.data).toEqual([]);
    expect((await bob.get(url)).status).toBe(404);
    expect((await bob.patch(url, { title: 'Piraté' })).status).toBe(404);
    expect((await bob.post(`${url}/complete`, {})).status).toBe(404);
    expect((await bob.post(`${url}/reopen`)).status).toBe(404);
    expect((await bob.post(`${url}/cancel`)).status).toBe(404);
    expect((await bob.post(`${url}/tasks`, { role: 'PREPARATION' })).status).toBe(404);
    expect((await bob.del(url)).status).toBe(404);
    expect((await bob.get('/api/events/pas-un-uuid')).status).toBe(404);
    // Pas de rattachement à l'objectif ou au jalon d'autrui.
    const mine = { type: 'APPEL', title: 'Mon appel', date: '2026-12-01', startTime: '10:00', endTime: '10:30' };
    expect((await bob.post('/api/events', { ...mine, goalId: aliceGoal.id })).status).toBe(404);
    expect((await bob.post('/api/events', { ...mine, milestoneId: aliceMilestone.id })).status).toBe(404);
    // Aucune fuite via « Aujourd'hui » ni le bilan.
    expect((await bob.get('/api/today?date=2026-12-01')).body.data.events).toEqual([]);
    expect((await bob.get('/api/reviews?period=day&date=2026-12-01')).body.data.events.expected).toBe(0);
    const intact = (await alice.get(url)).body.data;
    expect(intact).toMatchObject({ title: 'Rendez-vous privé', status: 'PREVU' });
    expect(intact.tasks).toEqual([]);
  });

  it("le budget d'Alice est inaccessible à Bob sur toutes les routes (spec 005, CA-11)", async () => {
    const setup = (await alice.post('/api/budget/setup')).body.data;
    const aliceAccount = setup.accounts[0].id as string;
    const aliceCategory = setup.categories.find((c: { type: string }) => c.type === 'DEPENSE').id as string;
    const aliceOp = (
      await alice.post('/api/budget/operations', {
        type: 'DEPENSE',
        label: 'Loyer',
        plannedAmount: 50_000,
        dueDate: '2026-12-05',
        categoryId: aliceCategory,
        accountId: aliceAccount,
      })
    ).body.data;
    const settled = (
      await alice.post(`/api/budget/operations/${aliceOp.id}/settle`, { amount: 20_000, accountId: aliceAccount, idempotencyKey: 'cle-alice-0001' })
    ).body.data;
    await alice.put('/api/budget/envelopes', { month: '2026-12', categoryId: aliceCategory, plannedAmount: 80_000 });

    const bobSetup = (await bob.post('/api/budget/setup')).body.data;
    const bobAccount = bobSetup.accounts[0].id as string;
    const bobCategory = bobSetup.categories.find((c: { type: string }) => c.type === 'DEPENSE').id as string;

    // Lecture : Bob ne voit que son propre budget (vide).
    const month = (await bob.get('/api/budget/months/2026-12')).body.data;
    expect(month.operations).toEqual([]);
    expect(month.transactions).toEqual([]);
    expect(month.envelopes).toEqual([]);
    expect(month.accounts.map((a: { id: string }) => a.id)).toEqual([bobAccount]);
    expect((await bob.get('/api/budget/accounts')).body.data.map((a: { id: string }) => a.id)).toEqual([bobAccount]);

    // Accès direct aux ressources d'Alice : 404.
    expect((await bob.patch(`/api/budget/accounts/${aliceAccount}`, { name: 'Piraté' })).status).toBe(404);
    expect((await bob.patch(`/api/budget/categories/${aliceCategory}`, { name: 'Piraté' })).status).toBe(404);
    expect((await bob.patch(`/api/budget/operations/${aliceOp.id}`, { plannedAmount: 1 })).status).toBe(404);
    expect((await bob.del(`/api/budget/operations/${aliceOp.id}`)).status).toBe(404);
    expect((await bob.del(`/api/budget/transactions/${settled.transaction.id}`)).status).toBe(404);
    expect(
      (await bob.post(`/api/budget/operations/${aliceOp.id}/settle`, { amount: 1_000, accountId: bobAccount, idempotencyKey: 'cle-bob-00001' })).status,
    ).toBe(404);
    expect((await bob.post('/api/budget/operations/pas-un-uuid/settle', { amount: 1, accountId: bobAccount, idempotencyKey: 'cle-bob-00002' })).status).toBe(404);

    // Pas de rattachement à un compte ou une catégorie d'autrui.
    const bobOp = { type: 'DEPENSE', label: 'Mon loyer', plannedAmount: 10_000, dueDate: '2026-12-05' };
    expect((await bob.post('/api/budget/operations', { ...bobOp, categoryId: aliceCategory })).status).toBe(404);
    expect((await bob.post('/api/budget/operations', { ...bobOp, accountId: aliceAccount })).status).toBe(404);
    const mine = (await bob.post('/api/budget/operations', { ...bobOp, categoryId: bobCategory })).body.data;
    expect((await bob.patch(`/api/budget/operations/${mine.id}`, { categoryId: aliceCategory })).status).toBe(404);
    expect((await bob.post(`/api/budget/operations/${mine.id}/settle`, { amount: 1_000, accountId: aliceAccount, idempotencyKey: 'cle-bob-00003' })).status).toBe(404);
    const tx = { type: 'DEPENSE', amount: 1_000, date: '2026-12-05' };
    expect((await bob.post('/api/budget/transactions', { ...tx, accountId: aliceAccount })).status).toBe(404);
    expect((await bob.post('/api/budget/transactions', { ...tx, accountId: bobAccount, categoryId: aliceCategory })).status).toBe(404);
    expect((await bob.put('/api/budget/envelopes', { month: '2026-12', categoryId: aliceCategory, plannedAmount: 1 })).status).toBe(404);

    // Une même clé d'idempotence chez deux utilisateurs ne se mélange pas : Bob ne rejoue pas la transaction d'Alice.
    const bobTx = await bob.post('/api/budget/transactions', { ...tx, accountId: bobAccount, idempotencyKey: 'cle-alice-0001' });
    expect(bobTx.status).toBe(201);
    expect(bobTx.body.data.transaction.id).not.toBe(settled.transaction.id);

    // Les données d'Alice sont intactes.
    const aliceMonth = (await alice.get('/api/budget/months/2026-12')).body.data;
    expect(aliceMonth.operations[0]).toMatchObject({ plannedAmount: 50_000, paid: 20_000, status: 'PARTIELLE' });
    expect(aliceMonth.envelopes[0].planned).toBe(80_000);
    expect(aliceMonth.accounts[0].balance).toBe(-20_000);
  });

  it("les données d'Alice sont intactes après les tentatives de Bob", async () => {
    await bob.patch(`/api/goals/${aliceGoal.id}`, { title: 'Piraté' });
    const goal = (await alice.get(`/api/goals/${aliceGoal.id}`)).body.data;
    expect(goal.title).toBe(goalPayload.title);
    expect(goal.tasks).toHaveLength(1);
  });

  it('un identifiant mal formé renvoie 404, pas 500', async () => {
    expect((await bob.get('/api/goals/pas-un-uuid')).status).toBe(404);
  });
});
