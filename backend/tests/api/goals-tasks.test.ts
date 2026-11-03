import { beforeEach, describe, expect, it } from 'vitest';
import { todayIn } from '../../src/core/dates.ts';
import { goalPayload, registerUser, resetDb, type TestUser } from '../helpers.ts';

// Les utilisateurs de test sont à Abidjan (UTC) : « aujourd'hui » est stable pour le serveur.
const today = todayIn('Africa/Abidjan');
const shift = (days: number) => {
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

let u: TestUser;
beforeEach(async () => {
  await resetDb();
  u = await registerUser('Awa');
});

describe('objectifs et jalons', () => {
  it('valide les champs obligatoires et la cohérence des dates (CA-4)', async () => {
    const noTitle = await u.post('/api/goals', { ...goalPayload, title: '' });
    expect(noTitle.status).toBe(400);
    const badCategory = await u.post('/api/goals', { ...goalPayload, category: 'LOISIRS' });
    expect(badCategory.status).toBe(400);
    const badDates = await u.post('/api/goals', { ...goalPayload, startDate: '2027-01-01', endDate: '2026-01-01' });
    expect(badDates.status).toBe(400);
    expect(badDates.body.details[0].field).toBe('endDate');
  });

  it('calcule la progression par jalons et signale l’absence de prochaine action (CA-12)', async () => {
    const goal = (await u.post('/api/goals', goalPayload)).body.data;
    expect(goal.progress).toMatchObject({ percent: null, label: 'Ajoute un premier jalon' });
    expect(goal.needsNextAction).toBe(true);

    const m1 = (await u.post(`/api/goals/${goal.id}/milestones`, { title: 'Première démonstration', dueDate: shift(10) })).body.data;
    await u.post(`/api/goals/${goal.id}/milestones`, { title: 'Deuxième démonstration' });
    await u.patch(`/api/milestones/${m1.id}`, { completed: true }).expect(200);

    const detail = (await u.get(`/api/goals/${goal.id}`)).body.data;
    expect(detail.progress).toMatchObject({ done: 1, total: 2, percent: 50 });
    expect(detail.milestones).toHaveLength(2);
  });

  it('supprimer un objectif conserve ses tâches', async () => {
    const goal = (await u.post('/api/goals', goalPayload)).body.data;
    const task = (await u.post('/api/tasks', { title: 'Préparer la démo', goalId: goal.id })).body.data;
    await u.del(`/api/goals/${goal.id}`).expect(200);
    const after = (await u.get(`/api/tasks/${task.id}`)).body.data;
    expect(after.goalId).toBeNull();
  });
});

describe('tâches', () => {
  it('relie une tâche à un jalon et en déduit l’objectif (CA-5)', async () => {
    const goal = (await u.post('/api/goals', goalPayload)).body.data;
    const m = (await u.post(`/api/goals/${goal.id}/milestones`, { title: 'Démo' })).body.data;
    const task = (await u.post('/api/tasks', { title: 'Préparer les comptes de démonstration', milestoneId: m.id, workDate: today })).body.data;
    expect(task.goalId).toBe(goal.id);

    const other = (await u.post('/api/goals', { ...goalPayload, title: 'Autre' })).body.data;
    const mismatch = await u.post('/api/tasks', { title: 'X', goalId: other.id, milestoneId: m.id });
    expect(mismatch.status).toBe(400);

    const detail = (await u.get(`/api/goals/${goal.id}`)).body.data;
    expect(detail.nextAction.id).toBe(task.id);
    expect(detail.needsNextAction).toBe(false);
  });

  it('seul le titre est obligatoire ; date invalide refusée (CA-6)', async () => {
    const minimal = await u.post('/api/tasks', { title: 'Appeler le directeur' });
    expect(minimal.status).toBe(201);
    expect(minimal.body.data).toMatchObject({ status: 'TODO', workDate: null, unscheduled: true });
    const bad = await u.post('/api/tasks', { title: 'X', workDate: '2026-02-30' });
    expect(bad.status).toBe(400);
  });

  it('cocher puis annuler la validation (CA-7), double appui sans effet', async () => {
    const task = (await u.post('/api/tasks', { title: 'Réviser le vocabulaire', workDate: today })).body.data;
    const done = (await u.post(`/api/tasks/${task.id}/complete`)).body.data;
    expect(done.status).toBe('DONE');
    expect(done.completedAt).not.toBeNull();

    const again = (await u.post(`/api/tasks/${task.id}/complete`)).body.data;
    expect(again.completedAt).toBe(done.completedAt);

    const reopened = (await u.post(`/api/tasks/${task.id}/reopen`)).body.data;
    expect(reopened).toMatchObject({ status: 'TODO', completedAt: null });
  });

  it('reporter sans dupliquer et conserver la date initiale (CA-8)', async () => {
    const task = (await u.post('/api/tasks', { title: 'Courir 5 km', workDate: today })).body.data;
    await u.post(`/api/tasks/${task.id}/reschedule`, { workDate: shift(1) }).expect(200);
    await u.post(`/api/tasks/${task.id}/reschedule`, { workDate: shift(1) }).expect(200); // double appui
    const r = (await u.post(`/api/tasks/${task.id}/reschedule`, { workDate: null })).body.data;
    expect(r).toMatchObject({ id: task.id, originalDate: today, workDate: null, rescheduleCount: 2, unscheduled: true });

    const list = (await u.get('/api/tasks')).body.data;
    expect(list.total).toBe(1);

    const unscheduled = (await u.get('/api/tasks?unscheduled=true')).body.data;
    expect(unscheduled.items.map((t: { id: string }) => t.id)).toEqual([task.id]);
  });

  it('refuse de reporter une tâche terminée', async () => {
    const task = (await u.post('/api/tasks', { title: 'Lire un chapitre', workDate: today })).body.data;
    await u.post(`/api/tasks/${task.id}/complete`);
    const r = await u.post(`/api/tasks/${task.id}/reschedule`, { workDate: shift(2) });
    expect(r.status).toBe(409);
  });

  it('pagine les listes et valide les filtres', async () => {
    for (let i = 0; i < 3; i += 1) await u.post('/api/tasks', { title: `Tâche ${i}`, workDate: shift(i) });
    const page = (await u.get('/api/tasks?limit=2&offset=0')).body.data;
    expect(page).toMatchObject({ total: 3, limit: 2 });
    expect(page.items).toHaveLength(2);
    expect((await u.get('/api/tasks?limit=500')).status).toBe(400);
    expect((await u.get(`/api/tasks?from=${shift(2)}&to=${today}`)).status).toBe(400);
  });
});

describe("vue « Aujourd'hui » (CA-9)", () => {
  it('sépare prévues, terminées, à replanifier et en retard', async () => {
    const planned = (await u.post('/api/tasks', { title: 'Prévue', workDate: today })).body.data;
    const done = (await u.post('/api/tasks', { title: 'Faite', workDate: today })).body.data;
    await u.post(`/api/tasks/${done.id}/complete`);
    const late = (await u.post('/api/tasks', { title: 'Oubliée hier', workDate: shift(-1) })).body.data;
    const overdue = (await u.post('/api/tasks', { title: 'Échéance passée', dueDate: shift(-2) })).body.data;

    const res = await u.get('/api/today');
    expect(res.status).toBe(200);
    const d = res.body.data;
    expect(d.date).toBe(today);
    expect(d.planned.map((t: { id: string }) => t.id)).toEqual([planned.id]);
    expect(d.done.map((t: { id: string }) => t.id)).toEqual([done.id]);
    expect(d.toReschedule.map((t: { id: string }) => t.id)).toEqual([late.id]);
    expect(d.toReschedule[0].needsRescheduling).toBe(true);
    expect(d.overdue.map((t: { id: string }) => t.id)).toEqual([overdue.id]);
    expect(d.overdue[0].overdue).toBe(true);
  });

  it('affiche « Aucune action prévue » pour une journée vide', async () => {
    const d = (await u.get(`/api/today?date=${shift(30)}`)).body.data;
    expect(d.emptyMessage).toBe('Aucune action prévue');
  });
});

describe('bilan (CA-10)', () => {
  it('calcule le taux avec son dénominateur, hors tâches annulées', async () => {
    const a = (await u.post('/api/tasks', { title: 'A', workDate: today })).body.data;
    await u.post('/api/tasks', { title: 'B', workDate: today });
    const c = (await u.post('/api/tasks', { title: 'C', workDate: today })).body.data;
    await u.post(`/api/tasks/${a.id}/complete`);
    await u.post(`/api/tasks/${c.id}/cancel`);

    const r = (await u.get(`/api/reviews?period=day&date=${today}`)).body.data;
    expect(r.tasks).toMatchObject({ expected: 2, done: 1, pending: 1, cancelled: 1 });
    expect(r.tasks.executionRate).toEqual({ numerator: 1, denominator: 2, percent: 50 });
    expect(r.questions).toHaveLength(3);
  });

  it('période vide : pas de taux', async () => {
    const r = (await u.get(`/api/reviews?from=${shift(100)}&to=${shift(106)}`)).body.data;
    expect(r.tasks.executionRate).toBeNull();
  });

  it('refuse une requête sans période', async () => {
    expect((await u.get('/api/reviews')).status).toBe(400);
  });
});
