import { beforeEach, describe, expect, it } from 'vitest';
import { todayIn } from '../../src/core/dates.ts';
import { goalPayload, registerUser, resetDb, type TestUser } from '../helpers.ts';

// Spec 004 : événements. Les utilisateurs de test sont à Abidjan (UTC).
const today = todayIn('Africa/Abidjan');
const shift = (days: number) => {
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

const demo = {
  type: 'REUNION',
  title: 'Démonstration au collège Les Palmiers',
  date: shift(1),
  startTime: '10:00',
  endTime: '11:30',
  location: 'Collège Les Palmiers, Cocody',
  participants: ['M. Koné (directeur)'],
  agenda: 'Présenter EcoleSaaS, recueillir les besoins',
  travelBeforeMinutes: 45,
  prepBeforeMinutes: 30,
};

let u: TestUser;
beforeEach(async () => {
  await resetDb();
  u = await registerUser('Awa');
});

describe('événements : création et lecture', () => {
  it('crée un événement avec jour, heures locales, temps réservé et départ (CA-1, CA-4)', async () => {
    const res = await u.post('/api/events', demo);
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      type: 'REUNION',
      status: 'PREVU',
      date: shift(1),
      startTime: '10:00',
      endTime: '11:30',
      startsAt: `${shift(1)}T10:00:00.000Z`,
      endsAt: `${shift(1)}T11:30:00.000Z`,
      participants: ['M. Koné (directeur)'],
      blockedMinutes: 75,
      blockedFromTime: '08:45',
      leaveAtTime: '09:15',
      blockedFrom: `${shift(1)}T08:45:00.000Z`,
    });
  });

  it('valide les champs (CA-1, CA-3, CA-4)', async () => {
    const bad = async (patch: object) => u.post('/api/events', { ...demo, ...patch });
    expect((await bad({ title: '' })).status).toBe(400);
    expect((await bad({ type: 'FETE' })).status).toBe(400);
    expect((await bad({ startTime: '25:00' })).status).toBe(400);
    expect((await bad({ date: '2026-02-30' })).status).toBe(400);
    const order = await bad({ startTime: '12:00', endTime: '11:00' });
    expect(order.status).toBe(400);
    expect(order.body.details[0].field).toBe('endTime');
    expect((await bad({ link: 'javascript:alert(1)' })).status).toBe(400);
    expect((await bad({ link: 'ftp://exemple.fr/salle' })).status).toBe(400);
    expect((await bad({ participants: Array.from({ length: 21 }, (_, i) => `P${i}`) })).status).toBe(400);
    expect((await bad({ travelBeforeMinutes: 481 })).status).toBe(400);
    expect((await bad({ prepBeforeMinutes: -5 })).status).toBe(400);
    const ok = await bad({ type: 'VISIO', link: 'https://meet.exemple.fr/salle-12', location: null });
    expect(ok.status).toBe(201);
    expect(ok.body.data.link).toBe('https://meet.exemple.fr/salle-12');
  });

  it("convertit d'après le fuseau de l'utilisateur, changement d'heure compris (CA-2)", async () => {
    await u.patch('/api/auth/me', { timezone: 'Europe/Paris' });
    const summer = (await u.post('/api/events', { ...demo, date: '2026-07-01', travelBeforeMinutes: 0, prepBeforeMinutes: 0 })).body.data;
    expect(summer).toMatchObject({ startsAt: '2026-07-01T08:00:00.000Z', startTime: '10:00', date: '2026-07-01' });
    const winter = (await u.post('/api/events', { ...demo, date: '2026-12-01' })).body.data;
    expect(winter).toMatchObject({ startsAt: '2026-12-01T09:00:00.000Z', startTime: '10:00' });
    // Minuit local de Paris = 22 h ou 23 h UTC la veille : l'événement reste sur son jour local.
    const late = (await u.post('/api/events', { ...demo, date: '2026-07-01', startTime: '00:30', endTime: '01:00' })).body.data;
    expect(late).toMatchObject({ startsAt: '2026-06-30T22:30:00.000Z', date: '2026-07-01' });
    const day = (await u.get('/api/events?from=2026-07-01&to=2026-07-01')).body.data;
    expect(day.map((e: { id: string }) => e.id)).toEqual([late.id, summer.id]);
  });

  it('liste par plage de jours et par statut, par ordre chronologique', async () => {
    const later = (await u.post('/api/events', { ...demo, title: 'Plus tard', date: shift(3), startTime: '09:00', endTime: '10:00' })).body.data;
    const first = (await u.post('/api/events', { ...demo, title: 'Premier', date: shift(1) })).body.data;
    const cancelled = (await u.post('/api/events', { ...demo, title: 'Annulé', date: shift(2) })).body.data;
    await u.post(`/api/events/${cancelled.id}/cancel`);

    const all = (await u.get('/api/events')).body.data;
    expect(all.map((e: { title: string }) => e.title)).toEqual(['Premier', 'Annulé', 'Plus tard']);
    const range = (await u.get(`/api/events?from=${shift(1)}&to=${shift(2)}`)).body.data;
    expect(range.map((e: { id: string }) => e.id)).toEqual([first.id, cancelled.id]);
    const planned = (await u.get('/api/events?status=PREVU')).body.data;
    expect(planned.map((e: { id: string }) => e.id)).toEqual([first.id, later.id]);
    expect((await u.get(`/api/events?from=${shift(3)}&to=${shift(1)}`)).status).toBe(400);
  });

  it('modifie un événement en revérifiant la cohérence des heures', async () => {
    const e = (await u.post('/api/events', demo)).body.data;
    const moved = await u.patch(`/api/events/${e.id}`, { startTime: '14:00', endTime: '15:00', title: 'Reporté' });
    expect(moved.body.data).toMatchObject({ title: 'Reporté', startTime: '14:00', endTime: '15:00', startsAt: `${shift(1)}T14:00:00.000Z` });
    // Seule l'heure de début avance au-delà de la fin existante : refusé.
    const bad = await u.patch(`/api/events/${e.id}`, { startTime: '16:00' });
    expect(bad.status).toBe(400);
    expect(bad.body.details[0].field).toBe('endTime');
    const day = await u.patch(`/api/events/${e.id}`, { date: shift(5) });
    expect(day.body.data).toMatchObject({ date: shift(5), startTime: '14:00' });
  });
});

describe('événements : statuts (idempotents)', () => {
  it('réalisé, rouvert et annulé sans doublon ni erreur sur un double appui (CA-5)', async () => {
    const e = (await u.post('/api/events', demo)).body.data;

    const done = await u.post(`/api/events/${e.id}/complete`, { decisions: 'Pilote validé pour janvier' });
    expect(done.body.data).toMatchObject({ status: 'REALISE', decisions: 'Pilote validé pour janvier' });
    const again = await u.post(`/api/events/${e.id}/complete`, {});
    expect(again.status).toBe(200);
    expect(again.body.data.completedAt).toBe(done.body.data.completedAt);
    expect(again.body.data.decisions).toBe('Pilote validé pour janvier');

    expect((await u.post(`/api/events/${e.id}/cancel`)).status).toBe(409);
    expect((await u.post(`/api/events/${e.id}/reopen`)).body.data).toMatchObject({ status: 'PREVU', completedAt: null });
    expect((await u.post(`/api/events/${e.id}/reopen`)).body.data.status).toBe('PREVU');

    expect((await u.post(`/api/events/${e.id}/cancel`)).body.data.status).toBe('ANNULE');
    expect((await u.post(`/api/events/${e.id}/cancel`)).body.data.status).toBe('ANNULE');
    expect((await u.post(`/api/events/${e.id}/complete`, {})).status).toBe(409);
    expect((await u.post(`/api/events/${e.id}/reopen`)).body.data.status).toBe('PREVU');
  });

  it('refuse des décisions trop longues', async () => {
    const e = (await u.post('/api/events', demo)).body.data;
    expect((await u.post(`/api/events/${e.id}/complete`, { decisions: 'x'.repeat(2001) })).status).toBe(400);
  });
});

describe('événements : objectif, tâches liées, suppression', () => {
  it("rattache un objectif et un jalon cohérents, refuse l'incohérence (CA-9)", async () => {
    const goal = (await u.post('/api/goals', goalPayload)).body.data;
    const other = (await u.post('/api/goals', { ...goalPayload, title: 'Autre objectif' })).body.data;
    const milestone = (await u.post(`/api/goals/${goal.id}/milestones`, { title: 'Première démonstration' })).body.data;

    const ok = await u.post('/api/events', { ...demo, milestoneId: milestone.id });
    expect(ok.body.data).toMatchObject({ goalId: goal.id, milestoneId: milestone.id });
    const mismatch = await u.post('/api/events', { ...demo, goalId: other.id, milestoneId: milestone.id });
    expect(mismatch.status).toBe(400);
    expect((await u.post('/api/events', { ...demo, goalId: '0b0b0b0b-0b0b-4b0b-8b0b-0b0b0b0b0b0b' })).status).toBe(404);
  });

  it('crée une tâche de préparation et de suivi liées, qui héritent de l’objectif (CA-6)', async () => {
    const goal = (await u.post('/api/goals', goalPayload)).body.data;
    const e = (await u.post('/api/events', { ...demo, goalId: goal.id, date: shift(3) })).body.data;

    const prep = await u.post(`/api/events/${e.id}/tasks`, { role: 'PREPARATION' });
    expect(prep.status).toBe(201);
    expect(prep.body.data).toMatchObject({
      title: 'Préparer : Démonstration au collège Les Palmiers',
      workDate: shift(2),
      eventId: e.id,
      eventRole: 'PREPARATION',
      goalId: goal.id,
      status: 'TODO',
    });
    const follow = await u.post(`/api/events/${e.id}/tasks`, { role: 'SUIVI', title: 'Envoyer le devis', workDate: null });
    expect(follow.body.data).toMatchObject({ title: 'Envoyer le devis', workDate: null, eventRole: 'SUIVI', unscheduled: true });
    expect((await u.post(`/api/events/${e.id}/tasks`, { role: 'AUTRE' })).status).toBe(400);

    const detail = (await u.get(`/api/events/${e.id}`)).body.data;
    expect(detail.tasks.map((t: { eventRole: string }) => t.eventRole)).toEqual(['PREPARATION', 'SUIVI']);

    // Un événement imminent ne reçoit pas de tâche « dans le passé ».
    const soon = (await u.post('/api/events', { ...demo, date: today })).body.data;
    expect((await u.post(`/api/events/${soon.id}/tasks`, { role: 'PREPARATION' })).body.data.workDate).toBe(today);
  });

  it('conserve les tâches quand l’événement est supprimé (CA-8)', async () => {
    const e = (await u.post('/api/events', demo)).body.data;
    const task = (await u.post(`/api/events/${e.id}/tasks`, { role: 'PREPARATION' })).body.data;
    expect((await u.del(`/api/events/${e.id}`)).status).toBe(200);
    expect((await u.get(`/api/events/${e.id}`)).status).toBe(404);
    const kept = (await u.get(`/api/tasks/${task.id}`)).body.data;
    expect(kept).toMatchObject({ id: task.id, eventId: null });
  });
});

describe('événements : aujourd’hui et bilan', () => {
  it('apparaissent dans « Aujourd’hui » (hors annulés, par heure) et dans le bilan (CA-7)', async () => {
    const pm = (await u.post('/api/events', { ...demo, title: 'Après-midi', date: today, startTime: '15:00', endTime: '16:00' })).body.data;
    const am = (await u.post('/api/events', { ...demo, title: 'Matin', date: today, startTime: '09:00', endTime: '10:00' })).body.data;
    const off = (await u.post('/api/events', { ...demo, title: 'Annulé', date: today })).body.data;
    await u.post(`/api/events/${off.id}/cancel`);
    await u.post('/api/events', { ...demo, title: 'Demain', date: shift(1) });
    await u.post(`/api/events/${am.id}/complete`, {});

    const view = (await u.get('/api/today')).body.data;
    expect(view.events.map((e: { title: string }) => e.title)).toEqual(['Matin', 'Après-midi']);
    expect(view.events[0].status).toBe('REALISE');
    expect(pm.id).toBe(view.events[1].id);

    const review = (await u.get(`/api/reviews?period=day&date=${today}`)).body.data;
    expect(review.events).toEqual({ planned: 1, done: 1, cancelled: 1, expected: 2 });
    const empty = (await u.get('/api/reviews?period=day&date=2030-01-01')).body.data;
    expect(empty.events).toEqual({ planned: 0, done: 0, cancelled: 0, expected: 0 });
  });
});
