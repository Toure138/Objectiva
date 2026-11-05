import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { formatHlc, parseHlc } from '../../../../shared/src/hlc';
import {
  FIELD_SCHEMAS,
  pushSchema,
  type Mutation,
  type MutationResult,
  type PullResponse,
  type PushRequest,
  type PushResponse,
  type SyncChange,
} from '../../../../shared/src/sync.schemas';
import { ApiError } from '../core/api-error';
import { ApiService } from '../core/api.service';

import { META } from './local-db';
import { OfflineService } from './offline.service';
import { SyncService } from './sync.service';

// Spec 007, phase 1 : côté téléphone, les messages envoyés sont valides, les conflits tranchés champ par
// champ, et la boucle de synchronisation résiste à toutes les pannes sans jamais rien perdre.

/** Faux serveur : mémorise ce qu'on lui envoie, sert des pages de changements préparées, simule les pannes. */
class FakeServer {
  pushed: Mutation[][] = [];
  changes: SyncChange[] = [];
  epoch = 'epoch-1';
  failWith: ApiError | null = null;
  pullCalls = 0;
  /** Lignes déjà présentes sur le serveur : une création y répond « déjà là ». */
  existing = new Set<string>();

  syncMeta = vi.fn(async () => {
    if (this.failWith) throw this.failWith;
    return { epoch: this.epoch, protocolVersion: 1, minProtocolVersion: 1, serverTime: new Date().toISOString() };
  });

  syncPush = vi.fn(async (body: PushRequest): Promise<PushResponse> => {
    if (this.failWith) throw this.failWith;
    this.pushed.push(body.mutations);
    return {
      epoch: this.epoch,
      results: body.mutations.map((m): MutationResult =>
        m.op === 'create' && this.existing.has(m.id)
          ? { mutationId: m.mutationId, status: 'ignored', reason: 'exists' }
          : { mutationId: m.mutationId, status: 'applied' },
      ),
    };
  });

  syncPull = vi.fn(async (cursor: number, limit: number): Promise<PullResponse> => {
    if (this.failWith) throw this.failWith;
    this.pullCalls += 1;
    const rest = this.changes.filter((c) => c.version > cursor);
    const page = rest.slice(0, limit);
    return {
      epoch: this.epoch,
      cursor: page.length ? page[page.length - 1]!.version : cursor,
      hasMore: rest.length > limit,
      changes: page,
    };
  });
}

const network = () => new ApiError('Impossible de joindre le serveur.', 0, 'NETWORK_ERROR');

let server: FakeServer;
let offline: OfflineService;
let sync: SyncService;
let counter = 0;

async function setup(opts: { ready?: boolean } = {}): Promise<void> {
  server = new FakeServer();
  TestBed.configureTestingModule({ providers: [{ provide: ApiService, useValue: server }] });
  offline = TestBed.inject(OfflineService);
  sync = TestBed.inject(SyncService);
  await offline.attach({ id: `user-${Date.now()}-${++counter}`, timezone: 'Africa/Abidjan' });
  if (opts.ready ?? true) await offline.markBootstrapped();
}

const call = async (method: string, path: string, body?: unknown) => {
  const res = await offline.tryLocal(method, path, body);
  expect(res, `${method} ${path}`).not.toBeNull();
  return res!;
};
const task = (id: string, over: object = {}) =>
  call('POST', '/tasks', { id, title: `Tâche ${id.slice(-3)}`, workDate: '2026-11-04', ...over });
const uuid = (n: number) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;
const taskRow = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  goalId: null,
  milestoneId: null,
  eventId: null,
  eventRole: null,
  title: 'Du serveur',
  notes: null,
  workDate: '2026-11-04',
  dueDate: null,
  status: 'TODO',
  completedAt: null,
  originalDate: '2026-11-04',
  rescheduleCount: 0,
  createdAt: '2026-11-01T08:00:00.000Z',
  updatedAt: '2026-11-01T08:00:00.000Z',
  ...over,
});
const upsert = (
  id: string,
  version: number,
  row: Record<string, unknown>,
  clocks: Record<string, string>,
): SyncChange => ({
  entity: 'tasks',
  op: 'upsert',
  id,
  version,
  row,
  clocks,
});
const clock = (wall: number, node = 'serveur') => formatHlc({ wall, counter: 0, node });

beforeEach(() => vi.useFakeTimers({ toFake: ['Date'] }));
afterEach(() => {
  sync?.stop();
  vi.useRealTimers();
  TestBed.resetTestingModule();
});

describe('messages produits par le téléphone', () => {
  it('chaque écriture est enregistrée dans le journal, dans l’ordre, avec des messages valides pour le serveur', async () => {
    await setup();
    const goal = uuid(1);
    await call('POST', '/goals', {
      id: goal,
      title: 'Objectif',
      category: 'CARRIERE',
      startDate: '2026-10-01',
      endDate: '2027-06-30',
      progressMode: 'MESURE',
      measureUnit: 'km',
      startValue: 0,
      targetValue: 10,
    });
    await call('POST', `/goals/${goal}/milestones`, { id: uuid(2), title: 'Jalon', dueDate: '2026-11-20' });
    await call('POST', `/goals/${goal}/readings`, { id: uuid(3), value: 4, readOn: '2026-11-03' });
    await task(uuid(4), { goalId: goal });
    await call('PATCH', `/tasks/${uuid(4)}`, { title: 'Renommée', dueDate: '2026-11-09' });
    await call('POST', `/tasks/${uuid(4)}/complete`);
    await call('POST', `/tasks/${uuid(4)}/reschedule`, { workDate: '2026-11-09' }); // refusée (tâche terminée) : rien enregistré
    await call('DELETE', `/tasks/${uuid(4)}`);

    const items = await offline.current!.pending();
    expect(items.map((i) => `${i.mutation.op} ${i.mutation.entity}`)).toEqual([
      'create goals',
      'create milestones',
      'create goal_readings',
      'create tasks',
      'update tasks',
      'update tasks',
      'delete tasks',
    ]);
    const mutations = items.map((i) => i.mutation);
    // Ce que le serveur recevra passe SES schémas de validation.
    expect(pushSchema.safeParse({ deviceId: 'phone-a', mutations }).success).toBe(true);
    for (const m of mutations.filter((x) => x.op === 'create')) {
      const schema = FIELD_SCHEMAS[m.entity];
      expect(schema.safeParse(m.fields).success, `${m.entity}`).toBe(true);
      expect(m.createdAt).toBeDefined();
    }
    for (const m of mutations.filter((x) => x.op === 'update'))
      expect(FIELD_SCHEMAS[m.entity].partial().safeParse(m.fields).success).toBe(true);
    expect(mutations[5]!.fields).toMatchObject({ status: 'DONE' });
    expect(Object.keys(mutations[4]!.fields!).sort()).toEqual(['dueDate', 'title']);
    expect(new Set(mutations.map((m) => m.mutationId)).size).toBe(mutations.length);
  });

  it('l’horloge de chaque modification est strictement croissante, même si l’heure du téléphone recule', async () => {
    await setup();
    vi.setSystemTime(new Date('2026-11-04T10:00:00Z'));
    await task(uuid(10));
    await call('PATCH', `/tasks/${uuid(10)}`, { title: 'A' });
    vi.setSystemTime(new Date('2026-11-04T09:00:00Z')); // l'horloge recule d'une heure
    await call('PATCH', `/tasks/${uuid(10)}`, { title: 'B' });
    const clocks = (await offline.current!.pending()).map((i) => Object.values(i.mutation.clocks ?? {})[0]!);
    expect([...clocks].sort()).toEqual(clocks);
    expect(new Set(clocks).size).toBe(clocks.length);
    expect(parseHlc(clocks[2]!)!.wall).toBe(Date.parse('2026-11-04T10:00:00Z'));
  });

  it('une modification sans effet (même date de report) n’est pas envoyée', async () => {
    await setup();
    await task(uuid(11));
    const before = await offline.current!.pendingCount();
    await call('POST', `/tasks/${uuid(11)}/reschedule`, { workDate: '2026-11-04' });
    expect(await offline.current!.pendingCount()).toBe(before);
  });
});

describe('changements reçus du serveur', () => {
  it('insère les nouveautés, avec leurs horloges, et mémorise le curseur et l’époque', async () => {
    await setup();
    const id = uuid(20);
    await offline.current!.applyPull([upsert(id, 5, taskRow(id), { title: clock(1000) })], 5, 'epoch-9');
    const res = await call('GET', `/tasks/${id}`);
    expect(res.body).toMatchObject({ success: true, data: { id, title: 'Du serveur' } });
    expect(await offline.current!.db.getMeta(META.cursor)).toBe(5);
    expect(await offline.current!.db.getMeta(META.epoch)).toBe('epoch-9');
  });

  it('champ par champ : la modification locale plus récente est conservée, celle du serveur plus récente est prise', async () => {
    await setup();
    const id = uuid(21);
    vi.setSystemTime(new Date(5_000));
    await offline.current!.applyPull(
      [upsert(id, 1, taskRow(id, { title: 'Base' }), { title: clock(1000), notes: clock(1000) })],
      1,
      'e',
    );
    vi.setSystemTime(new Date(9_000));
    await call('PATCH', `/tasks/${id}`, { title: 'Local récent' }); // horloge locale 9000
    const serverRow = taskRow(id, { title: 'Serveur ancien', notes: 'note du serveur', workDate: '2026-11-20' });
    await offline.current!.applyPull(
      [upsert(id, 2, serverRow, { title: clock(7000), notes: clock(8000), workDate: clock(8000) })],
      2,
      'e',
    );
    const data = ((await call('GET', `/tasks/${id}`)).body as { data: Record<string, unknown> }).data;
    expect(data).toMatchObject({ title: 'Local récent', notes: 'note du serveur', workDate: '2026-11-20' });
  });

  it('une horloge locale plus ancienne laisse passer le serveur, puis les modifications suivantes lui sont supérieures', async () => {
    await setup();
    const id = uuid(22);
    vi.setSystemTime(new Date(1_000));
    await task(id);
    await call('PATCH', `/tasks/${id}`, { title: 'Local' });
    await offline.current!.applyPull(
      [upsert(id, 3, taskRow(id, { title: 'Serveur' }), { title: clock(50_000) })],
      3,
      'e',
    );
    expect(((await call('GET', `/tasks/${id}`)).body as { data: { title: string } }).data.title).toBe('Serveur');
    // Le téléphone a vu l'horloge 50 000 : sa prochaine modification doit la dépasser même si son heure est en retard.
    await call('PATCH', `/tasks/${id}`, { title: 'Reprise' });
    const last = (await offline.current!.pending()).at(-1)!.mutation;
    expect(last.clocks!['title']! > clock(50_000)).toBe(true);
  });

  it('une suppression reçue retire la donnée et, pour un objectif, ses jalons et relevés ; ses tâches sont détachées', async () => {
    await setup();
    const goal = uuid(30);
    await call('POST', '/goals', {
      id: goal,
      title: 'G',
      category: 'SANTE',
      startDate: '2026-10-01',
      endDate: '2027-01-01',
      progressMode: 'MESURE',
      measureUnit: 'km',
      startValue: 0,
      targetValue: 5,
    });
    await call('POST', `/goals/${goal}/milestones`, { id: uuid(31), title: 'J' });
    await call('POST', `/goals/${goal}/readings`, { id: uuid(32), value: 1 });
    await task(uuid(33), { goalId: goal, milestoneId: uuid(31) });
    await offline.current!.acknowledge(
      (await offline.current!.pending()).map((i) => ({
        mutationId: i.mutation.mutationId,
        status: 'applied' as const,
      })),
    );

    await offline.current!.applyPull([{ entity: 'goals', op: 'delete', id: goal, version: 9 }], 9, 'e');
    expect((await call('GET', `/goals/${goal}`)).status).toBe(404);
    expect(await offline.current!.db.milestones.count()).toBe(0);
    expect(await offline.current!.db.readings.count()).toBe(0);
    expect(((await call('GET', `/tasks/${uuid(33)}`)).body as { data: Record<string, unknown> }).data).toMatchObject({
      goalId: null,
      milestoneId: null,
    });
  });

  it('une suppression faite ici et pas encore envoyée n’est pas annulée par une modification reçue', async () => {
    await setup();
    const id = uuid(40);
    await task(id);
    await call('DELETE', `/tasks/${id}`);
    await offline.current!.applyPull([upsert(id, 4, taskRow(id), { title: clock(9_999_999) })], 4, 'e');
    expect((await call('GET', `/tasks/${id}`)).status).toBe(404);
  });

  it('un nouvel appareil récupère tout puis fonctionne sans réseau', async () => {
    await setup({ ready: false });
    server.changes = Array.from({ length: 450 }, (_, i) =>
      upsert(uuid(100 + i), i + 1, taskRow(uuid(100 + i), { title: `Reçue ${i}` }), { title: clock(1000) }),
    );
    expect(offline.ready()).toBe(false);
    await sync.syncNow();
    expect(offline.ready()).toBe(true);
    expect(server.syncPull).toHaveBeenCalledTimes(3); // 450 changements, 200 par page
    expect(sync.state()).toBe('idle');
    const list = await call('GET', '/tasks?limit=100&offset=400');
    expect((list.body as { data: { total: number } }).data.total).toBe(450);
  });
});

describe('journal et acquittements', () => {
  it('sort du journal ce que le serveur a traité et garde ce qu’il a refusé, jamais en silence', async () => {
    await setup();
    await task(uuid(50));
    await task(uuid(51));
    const [a, b] = (await offline.current!.pending()).map((i) => i.mutation);
    await offline.current!.acknowledge([
      { mutationId: a!.mutationId, status: 'applied' },
      { mutationId: b!.mutationId, status: 'rejected', reason: 'invalid', message: 'Cette modification est invalide' },
    ]);
    await offline.refresh();
    expect(offline.pending()).toBe(0);
    expect(offline.rejections()).toHaveLength(1);
    expect(offline.rejections()[0]).toMatchObject({
      entity: 'tasks',
      id: uuid(51),
      message: 'Cette modification est invalide',
    });
    await offline.current!.clearRejections();
    await offline.refresh();
    expect(offline.rejections()).toEqual([]);
  });
});

describe('boucle de synchronisation', () => {
  it('envoie par lots de 200, dans l’ordre, puis vide le journal', async () => {
    await setup();
    for (let i = 0; i < 450; i++) await task(uuid(1000 + i));
    await sync.syncNow();
    expect(server.pushed.map((b) => b.length)).toEqual([200, 200, 50]);
    expect(offline.pending()).toBe(0);
    expect(sync.state()).toBe('idle');
    expect(sync.lastSyncAt()).not.toBeNull();
    // Les envois respectent l'ordre des modifications.
    const ids = server.pushed.flat().map((m) => m.id);
    expect(ids).toEqual(Array.from({ length: 450 }, (_, i) => uuid(1000 + i)));
  });

  it('sans réseau : tout continue localement, rien n’est perdu, la synchronisation reprend au retour du réseau', async () => {
    await setup();
    server.failWith = network();
    await task(uuid(60));
    await call('POST', `/tasks/${uuid(60)}/complete`);
    await sync.syncNow();
    expect(sync.state()).toBe('offline');
    expect(offline.pending()).toBe(2);
    // L'application répond toujours, depuis le téléphone.
    expect(
      ((await call('GET', '/today?date=2026-11-04')).body as { data: { done: unknown[] } }).data.done,
    ).toHaveLength(1);

    server.failWith = null;
    await sync.syncNow();
    expect(sync.state()).toBe('idle');
    expect(offline.pending()).toBe(0);
    expect(server.pushed.flat().map((m) => `${m.op}:${m.id}`)).toEqual([`create:${uuid(60)}`, `update:${uuid(60)}`]);
  });

  it('une coupure en plein envoi renvoie le même lot : le serveur reconnaît les numéros de modification', async () => {
    await setup();
    await task(uuid(70));
    server.syncPush.mockImplementationOnce(async (body: PushRequest) => {
      server.pushed.push(body.mutations); // le serveur a reçu, mais la réponse se perd
      throw network();
    });
    await sync.syncNow();
    expect(sync.state()).toBe('offline');
    expect(offline.pending()).toBe(1);
    await sync.syncNow();
    expect(server.pushed).toHaveLength(2);
    expect(server.pushed[1]![0]!.mutationId).toBe(server.pushed[0]![0]!.mutationId);
    expect(offline.pending()).toBe(0);
  });

  it('session expirée : état « reconnecte-toi », journal et données intacts, aucun réessai en boucle', async () => {
    await setup();
    await task(uuid(80));
    server.failWith = new ApiError('Connecte-toi', 401, 'UNAUTHENTICATED');
    await sync.syncNow();
    expect(sync.state()).toBe('auth');
    expect(offline.pending()).toBe(1);
    expect((await call('GET', `/tasks/${uuid(80)}`)).status).toBe(200);
    expect(server.syncPush).toHaveBeenCalledTimes(1);
    server.failWith = null;
    await sync.syncNow();
    expect(sync.state()).toBe('idle');
    expect(offline.pending()).toBe(0);
  });

  it('version trop ancienne : état « mise à jour », journal conservé', async () => {
    await setup();
    await task(uuid(90));
    server.failWith = new ApiError('Mets l’application à jour', 426, 'UPGRADE_REQUIRED');
    await sync.syncNow();
    expect(sync.state()).toBe('upgrade');
    expect(sync.lastError()).toContain('Mets');
    expect(offline.pending()).toBe(1);
  });

  it('une seule synchronisation à la fois (bis : avec reconstruction)', async () => {
    await setup();
    await task(uuid(97));
    await sync.syncNow();
    server.epoch = 'epoch-neuve';
    server.pushed = [];
    await Promise.all([sync.syncNow(), sync.syncNow()]);
    expect(server.pushed.flat().filter((m) => m.id === uuid(97) && m.op === 'create')).toHaveLength(1);
  });
});

describe('serveur remplacé ou restauré (changement d’époque)', () => {
  const GOAL = { title: 'Lancer EcoleSaaS', category: 'CARRIERE', startDate: '2026-11-01', endDate: '2027-03-31' };

  it('base neuve : le téléphone renvoie tout son état avant le journal, puis tout est relu depuis le début', async () => {
    await setup();
    await call('POST', '/goals', { ...GOAL, id: uuid(200) });
    await task(uuid(201), { goalId: uuid(200) });
    await sync.syncNow(); // première synchro : époque mémorisée, journal vidé
    await call('POST', `/tasks/${uuid(201)}/complete`); // en attente
    server.pushed = [];
    server.changes = [upsert(uuid(299), 1, taskRow(uuid(299)), { title: clock(500) })]; // déjà sur le nouveau serveur
    server.epoch = 'epoch-neuve';

    await sync.syncNow();

    expect(sync.state()).toBe('idle');
    const [snapshot, journal] = server.pushed;
    // 1) tout l'état, parents d'abord, avec des messages valides pour le serveur
    expect(snapshot!.map((m) => `${m.op}:${m.entity}:${m.id}`)).toEqual([
      `create:goals:${uuid(200)}`,
      `create:tasks:${uuid(201)}`,
    ]);
    expect(pushSchema.safeParse({ deviceId: 'appareil', mutations: snapshot }).success).toBe(true);
    for (const m of snapshot!) expect(FIELD_SCHEMAS[m.entity].safeParse(m.fields).success).toBe(true);
    // l'état renvoyé est l'état actuel : la tâche y est déjà terminée
    expect(snapshot![1]!.fields!['status']).toBe('DONE');
    // 2) puis le journal, qui n'est plus refusé
    expect(journal!.map((m) => m.op)).toEqual(['update']);
    expect(offline.pending()).toBe(0);
    expect(offline.rejections()).toEqual([]);
    // 3) relecture depuis le début avec la nouvelle époque
    expect(await offline.current!.db.getMeta(META.epoch)).toBe('epoch-neuve');
    expect(((await call('GET', `/tasks/${uuid(299)}`)).body as { data: { title: string } }).data.title).toBe(
      'Du serveur',
    );
    expect(sync.reseededAt()).not.toBeNull();

    // La synchronisation suivante est ordinaire : rien n'est renvoyé une seconde fois.
    server.pushed = [];
    await sync.syncNow();
    expect(server.pushed).toEqual([]);
  });

  it('sauvegarde restaurée : une ligne déjà connue du serveur est renvoyée en modification, champ par champ', async () => {
    await setup();
    await task(uuid(210));
    await sync.syncNow();
    await call('PATCH', `/tasks/${uuid(210)}`, { title: 'Titre après la sauvegarde' });
    await sync.syncNow();
    server.pushed = [];
    server.existing.add(uuid(210));
    server.epoch = 'epoch-restauree';

    await sync.syncNow();

    const [snapshot, merge, journal] = server.pushed;
    expect(snapshot!.map((m) => m.op)).toEqual(['create']);
    expect(merge).toHaveLength(1);
    expect(merge![0]).toMatchObject({ op: 'update', id: uuid(210), fields: { title: 'Titre après la sauvegarde' } });
    expect(merge![0]!.clocks).toEqual(snapshot![0]!.clocks);
    expect(merge![0]!.mutationId).not.toBe(snapshot![0]!.mutationId);
    expect(journal).toBeUndefined();
    expect(sync.state()).toBe('idle');
  });

  it('un champ sans horloge reçoit l’horloge minimale : il ne l’emporte jamais sur une vraie modification', async () => {
    await setup();
    await offline.current!.applyPull([upsert(uuid(220), 3, taskRow(uuid(220)), {})], 3, 'epoch-1');
    server.epoch = 'epoch-neuve';
    await sync.syncNow();
    const sent = server.pushed[0]!.find((m) => m.id === uuid(220))!;
    const clocks = Object.values(sent.clocks!);
    expect(clocks.length).toBe(Object.keys(sent.fields!).length);
    for (const c of clocks) expect(parseHlc(c)).toMatchObject({ wall: 0, counter: 0 });
  });

  it('refus du serveur pendant la reconstruction : conservés et montrés, jamais perdus en silence', async () => {
    await setup();
    await task(uuid(230));
    await sync.syncNow();
    server.epoch = 'epoch-neuve';
    server.syncPush.mockImplementationOnce(async (body: PushRequest) => ({
      epoch: server.epoch,
      results: body.mutations.map((m) => ({
        mutationId: m.mutationId,
        status: 'rejected' as const,
        reason: 'invalid',
        message: 'Refusée',
      })),
    }));
    await sync.syncNow();
    expect(offline.rejections().map((r) => r.id)).toEqual([uuid(230)]);
    expect((await call('GET', `/tasks/${uuid(230)}`)).status).toBe(200);
  });

  it('coupure en pleine reconstruction : rien n’est marqué fait, tout recommence au prochain essai', async () => {
    await setup();
    await task(uuid(240));
    await sync.syncNow();
    server.epoch = 'epoch-neuve';
    server.syncPush.mockImplementationOnce(async () => {
      throw network();
    });
    await sync.syncNow();
    expect(sync.state()).toBe('offline');
    expect(await offline.current!.db.getMeta(META.epoch)).toBe('epoch-1');
    server.pushed = [];
    await sync.syncNow();
    expect(server.pushed[0]!.map((m) => m.id)).toEqual([uuid(240)]);
    expect(await offline.current!.db.getMeta(META.epoch)).toBe('epoch-neuve');
  });

  it('première récupération inachevée puis serveur remplacé : elle repart de zéro, sans rien renvoyer', async () => {
    await setup({ ready: false });
    await offline.current!.applyPull([], 7, 'epoch-1');
    server.epoch = 'epoch-neuve';
    server.changes = [upsert(uuid(250), 1, taskRow(uuid(250)), { title: clock(500) })];
    await sync.syncNow();
    expect(server.pushed).toEqual([]);
    expect(offline.ready()).toBe(true);
    expect((await call('GET', `/tasks/${uuid(250)}`)).status).toBe(200);
  });

  it('une seule synchronisation à la fois', async () => {
    await setup();
    await task(uuid(96));
    await Promise.all([sync.syncNow(), sync.syncNow(), sync.syncNow()]);
    expect(server.pushed.flat().filter((m) => m.id === uuid(96))).toHaveLength(1);
  });
});
