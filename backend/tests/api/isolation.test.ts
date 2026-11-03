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
