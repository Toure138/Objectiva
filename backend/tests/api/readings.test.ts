import { beforeEach, describe, expect, it } from 'vitest';
import { goalPayload, registerUser, resetDb, type TestUser } from '../helpers.ts';

// Spec 003 : progression mesurée.
const measured = { ...goalPayload, progressMode: 'MESURE', measureUnit: 'démonstrations', startValue: 0, targetValue: 3 };

let u: TestUser;
beforeEach(async () => {
  await resetDb();
  u = await registerUser('Awa');
});

describe('progression mesurée', () => {
  it('crée un objectif mesuré avec sa progression de départ (CA-1, CA-2)', async () => {
    const res = await u.post('/api/goals', measured);
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      progressMode: 'MESURE',
      measureUnit: 'démonstrations',
      startValue: 0,
      targetValue: 3,
      progress: { mode: 'MESURE', current: 0, percent: 0, reached: false, label: '0 sur 3 démonstrations' },
    });
  });

  it('exige unité, départ et cible, et refuse une cible égale au départ (CA-1)', async () => {
    const missing = await u.post('/api/goals', { ...goalPayload, progressMode: 'MESURE' });
    expect(missing.status).toBe(400);
    expect(missing.body.details.map((d: { field: string }) => d.field).sort()).toEqual(['measureUnit', 'startValue', 'targetValue']);
    const same = await u.post('/api/goals', { ...measured, targetValue: 0 });
    expect(same.status).toBe(400);
    expect(same.body.details[0]).toMatchObject({ field: 'targetValue' });
    const decimal = await u.post('/api/goals', { ...measured, targetValue: 2.5 });
    expect(decimal.status).toBe(400);
  });

  it('enregistre un relevé et renvoie la progression à jour (CA-3, CA-4)', async () => {
    const goal = (await u.post('/api/goals', measured)).body.data;
    const res = await u.post(`/api/goals/${goal.id}/readings`, { value: 1, note: 'Collège Les Palmiers' });
    expect(res.status).toBe(201);
    expect(res.body.data.reading).toMatchObject({ value: 1, note: 'Collège Les Palmiers' });
    expect(res.body.data.progress).toMatchObject({ current: 1, percent: 33, label: '1 sur 3 démonstrations', reached: false });

    const detail = (await u.get(`/api/goals/${goal.id}`)).body.data;
    expect(detail.readings).toHaveLength(1);
    expect(detail.progress.percent).toBe(33);
    expect((await u.get('/api/goals')).body.data[0].progress.percent).toBe(33);

    const done = await u.post(`/api/goals/${goal.id}/readings`, { value: 3, readOn: '2099-01-01' });
    expect(done.body.data.progress).toMatchObject({ percent: 100, reached: true });
  });

  it('valide le relevé et refuse un objectif non mesuré (CA-4)', async () => {
    const goal = (await u.post('/api/goals', measured)).body.data;
    expect((await u.post(`/api/goals/${goal.id}/readings`, { value: 'beaucoup' })).status).toBe(400);
    expect((await u.post(`/api/goals/${goal.id}/readings`, { value: 1, readOn: '31/12/2026' })).status).toBe(400);

    const byMilestones = (await u.post('/api/goals', goalPayload)).body.data;
    const res = await u.post(`/api/goals/${byMilestones.id}/readings`, { value: 1 });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('CONFLICT');
  });

  it('supprime un relevé et recalcule (CA-5)', async () => {
    const goal = (await u.post('/api/goals', measured)).body.data;
    const first = (await u.post(`/api/goals/${goal.id}/readings`, { value: 1, readOn: '2026-11-02' })).body.data.reading;
    const second = (await u.post(`/api/goals/${goal.id}/readings`, { value: 2, readOn: '2026-11-05' })).body.data.reading;
    const res = await u.del(`/api/readings/${second.id}`);
    expect(res.status).toBe(200);
    expect(res.body.data.progress).toMatchObject({ current: 1, percent: 33 });
    expect((await u.del(`/api/readings/${second.id}`)).status).toBe(404);
    expect((await u.del(`/api/readings/${first.id}`)).body.data.progress.current).toBe(0);
  });

  it('passer en progression par jalons conserve les relevés et ne change pas les anciens objectifs (CA-6, CA-9)', async () => {
    const legacy = (await u.post('/api/goals', goalPayload)).body.data;
    expect(legacy.progress.mode).toBe('JALONS');
    expect(legacy.progressMode).toBe('JALONS');

    const goal = (await u.post('/api/goals', measured)).body.data;
    await u.post(`/api/goals/${goal.id}/readings`, { value: 2 });
    const back = await u.patch(`/api/goals/${goal.id}`, { progressMode: 'JALONS' });
    expect(back.body.data.progress.mode).toBe('JALONS');
    expect((await u.get(`/api/goals/${goal.id}`)).body.data.readings).toHaveLength(1);
    const again = await u.patch(`/api/goals/${goal.id}`, { progressMode: 'MESURE' });
    expect(again.body.data.progress).toMatchObject({ mode: 'MESURE', current: 2 });
  });

  it('refuse de passer en mode mesuré sans paramètres complets (CA-1)', async () => {
    const goal = (await u.post('/api/goals', goalPayload)).body.data;
    const res = await u.patch(`/api/goals/${goal.id}`, { progressMode: 'MESURE', measureUnit: 'km' });
    expect(res.status).toBe(400);
    expect(res.body.details.map((d: { field: string }) => d.field)).toContain('targetValue');
  });

  it('expose la progression mesurée dans le bilan (CA-7)', async () => {
    const goal = (await u.post('/api/goals', { ...measured, status: 'EN_COURS' })).body.data;
    await u.post(`/api/goals/${goal.id}/readings`, { value: 1 });
    const r = (await u.get('/api/reviews?period=month&date=2026-11-15')).body.data;
    expect(r.goals[0].progress).toMatchObject({ mode: 'MESURE', percent: 33 });
  });
});
