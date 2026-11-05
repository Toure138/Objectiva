import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { addDays, todayIn } from '../../../shared/src/dates.ts';
import { formatHlc } from '../../../shared/src/hlc.ts';
import { occurrenceId } from '../../../shared/src/recurrence.rules.ts';
import { prisma } from '../../src/core/prisma.ts';
import { app, goalPayload, registerUser, resetDb, type TestUser } from '../helpers.ts';

// Spec 009 : réunions récurrentes et agenda du jour (ce que le scénario de parité ne couvre pas).

let alice: TestUser;
let bob: TestUser;
let today: string;

const daily = (over: object = {}) => ({
  type: 'REUNION',
  title: 'Point quotidien',
  date: today,
  startTime: '09:00',
  endTime: '09:15',
  repeat: { weekdays: [1, 2, 3, 4, 5, 6, 7] },
  ...over,
});

beforeEach(async () => {
  await resetDb();
  alice = await registerUser('Alice');
  bob = await registerUser('Bob');
  today = todayIn('Africa/Abidjan');
});

describe('réunions récurrentes', () => {
  it('crée les occurrences jusqu’à 60 jours, puis plus loin quand on consulte une plage lointaine (CA-2)', async () => {
    const res = await alice.post('/api/events', daily());
    expect(res.status).toBe(201);
    const seriesId = res.body.data.seriesId as string;
    expect(res.body.data).toMatchObject({ date: today, occurrenceDate: today, repeat: { weekdays: [1, 2, 3, 4, 5, 6, 7], startDate: today, until: null } });
    expect(res.body.data.id).toBe(occurrenceId(seriesId, today));
    expect(await prisma.event.count({ where: { seriesId } })).toBe(61);

    const far = addDays(today, 120);
    const list = await alice.get(`/api/events?from=${far}&to=${far}`);
    expect(list.body.data.map((e: { date: string }) => e.date)).toEqual([far]);
    expect(await prisma.event.count({ where: { seriesId } })).toBe(121);
    // Consulter de nouveau ne crée rien de plus.
    await alice.get(`/api/events?from=${far}&to=${far}`);
    expect(await prisma.event.count({ where: { seriesId } })).toBe(121);
  });

  it('les heures restent locales au changement d’heure (CA-3)', async () => {
    await alice.patch('/api/auth/me', { timezone: 'Europe/Paris' });
    const start = '2027-03-26'; // vendredi avant le passage à l'heure d'été (28 mars)
    const created = await alice.post('/api/events', { ...daily({ date: start, startTime: '10:00', endTime: '10:30' }), repeat: { weekdays: [1, 2, 3, 4, 5, 6, 7], until: '2027-03-29' } });
    expect(created.status).toBe(201);
    const list = (await alice.get(`/api/events?from=${start}&to=2027-03-29`)).body.data as { date: string; startTime: string; startsAt: string }[];
    expect(list.map((e) => `${e.date} ${e.startTime}`)).toEqual(['2027-03-26 10:00', '2027-03-27 10:00', '2027-03-28 10:00', '2027-03-29 10:00']);
    // Même heure locale, mais pas le même instant UTC : 09:00Z en hiver, 08:00Z en été.
    expect(list.map((e) => e.startsAt.slice(11, 16))).toEqual(['09:00', '09:00', '08:00', '08:00']);
  });

  it('« et les suivantes » : un changement d’heure garde le jour de chaque occurrence, même déplacée (CA-4)', async () => {
    const first = (await alice.post('/api/events', daily())).body.data;
    const d2 = addDays(today, 2);
    const third = occurrenceId(first.seriesId, d2);
    // La 3e occurrence a été déplacée au lendemain.
    expect((await alice.patch(`/api/events/${third}`, { date: addDays(today, 3) })).body.data.date).toBe(addDays(today, 3));
    const second = occurrenceId(first.seriesId, addDays(today, 1));
    const res = await alice.patch(`/api/events/${second}?scope=following`, { startTime: '11:00', endTime: '11:30' });
    expect(res.status).toBe(200);
    expect((await alice.get(`/api/events/${first.id}`)).body.data.startTime).toBe('09:00');
    expect((await alice.get(`/api/events/${third}`)).body.data).toMatchObject({ date: addDays(today, 3), occurrenceDate: d2, startTime: '11:00' });
    // Fin avant début, même pour la suite : refusé, rien ne change.
    expect((await alice.patch(`/api/events/${second}?scope=following`, { endTime: '10:00' })).status).toBe(400);
    expect((await alice.get(`/api/events/${second}`)).body.data.endTime).toBe('11:30');
  });

  it('« et les suivantes » : raccourcir puis prolonger la répétition (CA-4)', async () => {
    const first = (await alice.post('/api/events', daily())).body.data;
    const seriesId = first.seriesId as string;
    const until = addDays(today, 5);
    expect((await alice.patch(`/api/events/${first.id}?scope=following`, { repeat: { until } })).status).toBe(200);
    expect(await prisma.event.count({ where: { seriesId } })).toBe(6);
    expect((await alice.patch(`/api/events/${first.id}?scope=following`, { repeat: { until: null } })).status).toBe(200);
    expect(await prisma.event.count({ where: { seriesId } })).toBe(61);
    // Fin avant cette occurrence : refusé.
    const later = occurrenceId(seriesId, addDays(today, 3));
    expect((await alice.patch(`/api/events/${later}?scope=following`, { repeat: { until: today } })).status).toBe(400);
  });

  it('supprimer : annuler cette fois, la suite (réalisées conservées), toute la série ; tâches conservées (CA-5)', async () => {
    const first = (await alice.post('/api/events', daily())).body.data;
    const seriesId = first.seriesId as string;
    const [o1, o2, o3] = [1, 2, 3].map((n) => occurrenceId(seriesId, addDays(today, n)));
    await alice.post(`/api/events/${o2}/complete`, { decisions: 'Noté' });
    const task = (await alice.post(`/api/events/${o3}/tasks`, { role: 'PREPARATION' })).body.data;

    expect((await alice.del(`/api/events/${first.id}?scope=occurrence`)).body.message).toBe('Occurrence annulée');
    expect((await alice.get(`/api/events/${first.id}`)).body.data.status).toBe('ANNULE');
    expect((await alice.post(`/api/events/${first.id}/reopen`)).body.data.status).toBe('PREVU');

    expect((await alice.del(`/api/events/${o1}?scope=following`)).body.message).toBe('Occurrences suivantes supprimées');
    expect((await alice.get(`/api/events/${o1}`)).status).toBe(404);
    expect((await alice.get(`/api/events/${o2}`)).body.data.decisions).toBe('Noté');
    expect((await alice.get(`/api/events/${first.id}`)).body.data.repeat.until).toBe(today);
    expect((await alice.get(`/api/tasks/${task.id}`)).body.data).toMatchObject({ eventId: null, eventRole: 'PREPARATION' });

    expect((await alice.del(`/api/events/${first.id}?scope=series`)).body.message).toBe('Série supprimée');
    expect(await prisma.event.count({ where: { userId: alice.user.id } })).toBe(0);
    expect(await prisma.eventSeries.count()).toBe(0);
  });

  it('agenda : colonnes et conflits, jamais les annulés (CA-6)', async () => {
    await alice.post('/api/events', { type: 'REUNION', title: 'A', date: today, startTime: '09:00', endTime: '10:00' });
    const b = (await alice.post('/api/events', { type: 'APPEL', title: 'B', date: today, startTime: '10:00', endTime: '10:30', travelBeforeMinutes: 20 })).body.data;
    const c = (await alice.post('/api/events', { type: 'VISIO', title: 'C', date: today, startTime: '09:30', endTime: '09:45' })).body.data;
    let agenda = (await alice.get(`/api/agenda?date=${today}`)).body.data;
    expect(agenda.conflictCount).toBe(3);
    const byTitle = Object.fromEntries(agenda.events.map((e: { title: string }) => [e.title, e]));
    // Le trajet de B (dès 9 h 40) empiète sur A (jusqu'à 10 h) et sur C (jusqu'à 9 h 45).
    expect(byTitle['B'].conflicts).toEqual([
      { withId: expect.any(String), kind: 'PREPARATION', withTitle: 'A' },
      { withId: c.id, kind: 'PREPARATION', withTitle: 'C' },
    ]);
    expect(byTitle['C'].conflicts.map((x: { withTitle: string }) => x.withTitle)).toEqual(['A', 'B']);
    expect(byTitle['C'].conflicts.map((x: { kind: string }) => x.kind)).toEqual(['CHEVAUCHEMENT', 'PREPARATION']);
    await alice.post(`/api/events/${c.id}/cancel`);
    await alice.post(`/api/events/${b.id}/cancel`);
    agenda = (await alice.get(`/api/agenda?date=${today}`)).body.data;
    expect(agenda.events.map((e: { title: string }) => e.title)).toEqual(['A']);
    expect(agenda).toMatchObject({ conflictCount: 0, startHour: 7, endHour: 21 });
    expect((await alice.get('/api/agenda?date=2026-02-30')).status).toBe(400);
  });

  it('isolation : série, occurrence, portées et agenda d’autrui sont introuvables (CA-9)', async () => {
    const goal = (await alice.post('/api/goals', goalPayload)).body.data;
    const first = (await alice.post('/api/events', daily({ goalId: goal.id }))).body.data;
    const url = `/api/events/${first.id}`;
    expect((await bob.get(url)).status).toBe(404);
    expect((await bob.patch(`${url}?scope=following`, { title: 'Piraté' })).status).toBe(404);
    expect((await bob.del(`${url}?scope=series`)).status).toBe(404);
    expect((await bob.del(`${url}?scope=occurrence`)).status).toBe(404);
    expect((await bob.get(`/api/agenda?date=${today}`)).body.data.events).toEqual([]);
    expect((await bob.get(`/api/events?from=${today}&to=${today}`)).body.data).toEqual([]);
    expect((await bob.post('/api/events', daily({ goalId: goal.id }))).status).toBe(404);
    // Recréer la série de quelqu'un d'autre avec son identifiant : refus uniforme, rien n'est touché.
    const attack = await bob.post('/api/events', daily({ id: first.seriesId }));
    expect(attack.status).toBe(409);
    expect((await alice.get(url)).body.data).toMatchObject({ title: 'Point quotidien', goalId: goal.id });
    expect(await prisma.eventSeries.count({ where: { userId: bob.user.id } })).toBe(0);
  });
});

// ---------------------------------------------------------------------------------------------
// Synchronisation des rendez-vous et des séries (CA-8)

const PROTOCOL = { 'X-Objectiva-Protocol': '2' };
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

const seriesFields = (over: Record<string, unknown> = {}) => ({
  goalId: null,
  milestoneId: null,
  type: 'REUNION',
  title: 'Point quotidien',
  startTime: '09:00',
  endTime: '09:15',
  location: null,
  link: null,
  participants: [],
  agenda: null,
  travelBeforeMinutes: 0,
  prepBeforeMinutes: 0,
  weekdays: [5, 1, 1],
  startDate: '2026-11-02',
  until: null,
  ...over,
});

const occurrenceFields = (seriesId: string, date: string, over: Record<string, unknown> = {}) => ({
  seriesId,
  occurrenceDate: date,
  goalId: null,
  milestoneId: null,
  type: 'REUNION',
  title: 'Point quotidien',
  startsAt: `${date}T09:00:00.000Z`,
  endsAt: `${date}T09:15:00.000Z`,
  location: null,
  link: null,
  participants: [],
  agenda: null,
  decisions: null,
  status: 'PREVU',
  travelBeforeMinutes: 0,
  prepBeforeMinutes: 0,
  completedAt: null,
  ...over,
});

const push = (u: TestUser, mutations: object[], headers = PROTOCOL) =>
  request(app).post('/api/sync/push').set('Authorization', `Bearer ${u.token}`).set(headers).send({ deviceId: 'phone-a', mutations });
const pull = (u: TestUser, headers = PROTOCOL) =>
  request(app).get('/api/sync/pull?cursor=0').set('Authorization', `Bearer ${u.token}`).set(headers);

describe('synchronisation des réunions récurrentes', () => {
  it('deux appareils créent la même occurrence hors ligne : une seule ligne, fusionnée champ par champ', async () => {
    const seriesId = randomUUID();
    const date = '2026-11-06';
    const id = occurrenceId(seriesId, date);
    const a = await push(alice, [mutation('create', 'event_series', seriesId, seriesFields(), 1000), mutation('create', 'events', id, occurrenceFields(seriesId, date), 1000)]);
    expect(a.body.data.results.map((r: { status: string }) => r.status)).toEqual(['applied', 'applied']);
    // Le second appareil a créé la même occurrence, puis l'a renommée plus tard.
    const b = await push(alice, [mutation('create', 'events', id, occurrenceFields(seriesId, date, { title: 'Point (salle B)' }), 2000, 'phone-b')]);
    expect(b.body.data.results[0].status).toBe('applied');
    expect(await prisma.event.count({ where: { seriesId } })).toBe(1);
    expect((await alice.get(`/api/events/${id}`)).body.data.title).toBe('Point (salle B)');
    // Jours dédoublonnés et triés par le serveur.
    expect((await prisma.eventSeries.findUniqueOrThrow({ where: { id: seriesId } })).weekdays).toEqual([1, 5]);
  });

  it('série supprimée ailleurs : une occurrence envoyée ensuite est ignorée ; la suppression descend en cascade', async () => {
    const seriesId = randomUUID();
    await push(alice, [mutation('create', 'event_series', seriesId, seriesFields(), 1000), mutation('create', 'events', occurrenceId(seriesId, '2026-11-02'), occurrenceFields(seriesId, '2026-11-02'), 1000)]);
    const cursor = (await pull(alice)).body.data.cursor as number;
    await push(alice, [mutation('delete', 'event_series', seriesId, undefined, 3000)]);
    const late = await push(alice, [mutation('create', 'events', occurrenceId(seriesId, '2026-11-06'), occurrenceFields(seriesId, '2026-11-06'), 2000, 'phone-b')]);
    expect(late.body.data.results[0]).toMatchObject({ status: 'ignored', reason: 'parent-missing' });
    const changes = (await request(app).get(`/api/sync/pull?cursor=${cursor}`).set('Authorization', `Bearer ${alice.token}`).set(PROTOCOL)).body.data.changes;
    expect(changes.map((c: { entity: string; op: string }) => `${c.op}:${c.entity}`).sort()).toEqual(['delete:event_series', 'delete:events']);
  });

  it('refuse une occurrence incohérente et une série dont la fin précède le début', async () => {
    const seriesId = randomUUID();
    const res = await push(alice, [
      mutation('create', 'event_series', seriesId, seriesFields({ until: '2026-11-01' }), 1000),
      mutation('create', 'events', randomUUID(), occurrenceFields(seriesId, '2026-11-02', { seriesId: null }), 1000),
      mutation('create', 'events', randomUUID(), occurrenceFields(seriesId, '2026-11-02', { seriesId: null, occurrenceDate: null, endsAt: '2026-11-02T08:00:00.000Z' }), 1000),
    ]);
    expect(res.body.data.results.map((r: { status: string }) => r.status)).toEqual(['rejected', 'rejected', 'rejected']);
  });

  it('une application en version 1 ne reçoit pas les rendez-vous, une application en version 2 si', async () => {
    await alice.post('/api/events', daily({ repeat: { weekdays: [1], until: addDays(today, 6) } }));
    const v1 = (await pull(alice, { 'X-Objectiva-Protocol': '1' })).body.data.changes.map((c: { entity: string }) => c.entity);
    const v2 = (await pull(alice)).body.data.changes.map((c: { entity: string }) => c.entity);
    expect(v1).not.toContain('events');
    expect(v1).not.toContain('event_series');
    expect(v2).toEqual(expect.arrayContaining(['event_series', 'events']));
  });

  it('isolation : la série ou l’occurrence d’un autre utilisateur n’est jamais modifiée ni révélée', async () => {
    const seriesId = randomUUID();
    await push(alice, [mutation('create', 'event_series', seriesId, seriesFields(), 1000)]);
    const res = await push(bob, [
      mutation('update', 'event_series', seriesId, { title: 'Piraté' }, 9000, 'phone-bob'),
      mutation('create', 'events', occurrenceId(seriesId, '2026-11-02'), occurrenceFields(seriesId, '2026-11-02'), 9000, 'phone-bob'),
    ]);
    expect(res.body.data.results.map((r: { status: string; reason?: string }) => `${r.status}:${r.reason}`)).toEqual(['rejected:not-found', 'ignored:parent-missing']);
    expect((await prisma.eventSeries.findUniqueOrThrow({ where: { id: seriesId } })).title).toBe('Point quotidien');
    expect(await prisma.event.count({ where: { userId: bob.user.id } })).toBe(0);
  });
});
