import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '../../src/core/prisma.ts';
import { todayIn } from '../../src/core/dates.ts';
import { registerUser, resetDb, type TestUser } from '../helpers.ts';

// Spec 005 : budget mensuel. Montants en francs CFA (XOF), entiers.
const today = todayIn('Africa/Abidjan');
const month = today.slice(0, 7);

let u: TestUser;
let cash: string;
let cat: Record<string, string>;

async function start(user: TestUser) {
  const res = await user.post('/api/budget/setup');
  const categories = res.body.data.categories as { id: string; name: string }[];
  return {
    account: res.body.data.accounts[0].id as string,
    cat: Object.fromEntries(categories.map((c) => [c.name, c.id])) as Record<string, string>,
  };
}

const op = (patch: object = {}) => ({
  type: 'DEPENSE',
  label: 'Transport et impression',
  plannedAmount: 15_000,
  dueDate: today,
  ...patch,
});

let seq = 0;
const key = () => `cle-test-${Date.now()}-${++seq}`;

beforeEach(async () => {
  await resetDb();
  u = await registerUser('Awa');
  ({ account: cash, cat } = await start(u));
});

afterEach(() => vi.restoreAllMocks());

describe('démarrage, comptes et catégories', () => {
  it('démarre une seule fois, même en cas de double appui simultané (CA-2)', async () => {
    const other = await registerUser('Koffi');
    const [a, b, c] = await Promise.all([other.post('/api/budget/setup'), other.post('/api/budget/setup'), other.post('/api/budget/setup')]);
    for (const r of [a, b, c]) expect(r.status).toBe(200);
    const accounts = (await other.get('/api/budget/accounts')).body.data;
    expect(accounts).toHaveLength(1);
    expect(accounts[0]).toMatchObject({ name: 'Espèces', kind: 'ESPECES', balance: 0 });
    const categories = (await other.get('/api/budget/categories')).body.data;
    expect(categories).toHaveLength(11);
    expect(new Set(categories.map((x: { name: string; type: string }) => `${x.type}:${x.name}`)).size).toBe(11);
    // Rappeler le démarrage plus tard ne rajoute rien.
    await other.post('/api/budget/setup');
    expect((await other.get('/api/budget/categories')).body.data).toHaveLength(11);
  });

  it('crée un compte avec solde d’ouverture, refuse un doublon ou un type inconnu (CA-2)', async () => {
    const res = await u.post('/api/budget/accounts', { name: 'Orange Money', kind: 'MOBILE_MONEY', openingBalance: 25_000 });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ name: 'Orange Money', kind: 'MOBILE_MONEY', openingBalance: 25_000, balance: 25_000 });
    expect((await u.post('/api/budget/accounts', { name: 'Orange Money', kind: 'BANQUE' })).status).toBe(409);
    expect((await u.post('/api/budget/accounts', { name: 'X', kind: 'CHEQUE' })).status).toBe(400);
    expect((await u.post('/api/budget/accounts', { name: '', kind: 'BANQUE' })).status).toBe(400);
    expect((await u.post('/api/budget/accounts', { name: 'Y', kind: 'BANQUE', openingBalance: 10.5 })).status).toBe(400);
  });

  it('archive un compte au lieu de le supprimer : il disparaît des choix et refuse les écritures', async () => {
    const acc = (await u.post('/api/budget/accounts', { name: 'Ancien compte', kind: 'BANQUE' })).body.data;
    await u.post('/api/budget/transactions', { type: 'DEPENSE', amount: 1_000, date: today, accountId: acc.id });
    expect((await u.patch(`/api/budget/accounts/${acc.id}`, { archived: true })).body.data.archived).toBe(true);
    expect((await u.get('/api/budget/accounts')).body.data.map((a: { id: string }) => a.id)).not.toContain(acc.id);
    expect((await u.get('/api/budget/accounts?archived=true')).body.data.map((a: { id: string }) => a.id)).toEqual([acc.id]);
    const blocked = await u.post('/api/budget/transactions', { type: 'DEPENSE', amount: 500, date: today, accountId: acc.id });
    expect(blocked.status).toBe(409);
    expect((await u.patch(`/api/budget/accounts/${acc.id}`, { archived: false })).body.data.balance).toBe(-1_000);
  });

  it('gère les catégories : doublon refusé, archivage, type cohérent (CA-9)', async () => {
    expect((await u.post('/api/budget/categories', { name: 'Transport', type: 'DEPENSE' })).status).toBe(409);
    const ok = await u.post('/api/budget/categories', { name: 'Transport', type: 'REVENU' });
    expect(ok.status).toBe(201);
    const wrong = await u.post('/api/budget/operations', op({ categoryId: cat['Salaire'] }));
    expect(wrong.status).toBe(400);
    expect(wrong.body.details[0].field).toBe('categoryId');
    await u.patch(`/api/budget/categories/${cat['Loisirs']}`, { archived: true });
    expect((await u.post('/api/budget/operations', op({ categoryId: cat['Loisirs'] }))).status).toBe(409);
    expect((await u.get('/api/budget/categories?type=DEPENSE')).body.data.map((c: { name: string }) => c.name)).not.toContain('Loisirs');
  });
});

describe('montants : entiers uniquement (CA-1)', () => {
  it('refuse décimaux, zéro, négatifs, textes et montants démesurés', async () => {
    for (const plannedAmount of [10.5, 0, -100, '15000', null, 1_000_000_001, Number.NaN]) {
      const res = await u.post('/api/budget/operations', op({ plannedAmount }));
      expect(res.status, `plannedAmount=${String(plannedAmount)}`).toBe(400);
    }
    const ok = await u.post('/api/budget/operations', op({ plannedAmount: 1_000_000_000 }));
    expect(ok.status).toBe(201);
    expect(ok.body.data.plannedAmount).toBe(1_000_000_000);
    const tx = { type: 'DEPENSE', date: today, accountId: cash };
    expect((await u.post('/api/budget/transactions', { ...tx, amount: 99.99 })).status).toBe(400);
    expect((await u.post('/api/budget/transactions', { ...tx, amount: 0 })).status).toBe(400);
  });

  it('l’utilisateur a une devise par défaut (XOF) exposée par l’API', async () => {
    expect((await u.get('/api/auth/me')).body.data.currency).toBe('XOF');
    expect((await u.get(`/api/budget/months/${month}`)).body.data.currency).toBe('XOF');
  });
});

describe('prévisions et règlement', () => {
  it('crée une prévision, la règle en deux fois puis la solde (CA-3, CA-4)', async () => {
    const created = await u.post('/api/budget/operations', op({ categoryId: cat['Transport'] }));
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({ status: 'PREVUE', plannedAmount: 15_000, paid: 0, remaining: 15_000, economy: 0, overrun: 0 });
    const id = created.body.data.id;

    const first = await u.post(`/api/budget/operations/${id}/settle`, { amount: 9_000, accountId: cash, idempotencyKey: key() });
    expect(first.status).toBe(201);
    expect(first.body.data.operation).toMatchObject({ status: 'PARTIELLE', paid: 9_000, remaining: 6_000 });
    expect(first.body.data.transaction).toMatchObject({ amount: 9_000, type: 'DEPENSE', plannedOperationId: id, accountId: cash });

    const second = await u.post(`/api/budget/operations/${id}/settle`, { amount: 6_000, accountId: cash, idempotencyKey: key() });
    expect(second.body.data.operation).toMatchObject({ status: 'SOLDEE', paid: 15_000, remaining: 0, economy: 0, overrun: 0 });
    expect((await u.get('/api/budget/accounts')).body.data[0].balance).toBe(-15_000);

    const again = await u.post(`/api/budget/operations/${id}/settle`, { amount: 100, accountId: cash, idempotencyKey: key() });
    expect(again.status).toBe(409);
  });

  it('solde avec moins que prévu : l’économie est la différence (CA-6)', async () => {
    const id = (await u.post('/api/budget/operations', op())).body.data.id;
    await u.post(`/api/budget/operations/${id}/settle`, { amount: 9_000, accountId: cash, idempotencyKey: key() });
    const res = await u.post(`/api/budget/operations/${id}/settle`, { amount: 3_000, accountId: cash, close: true, idempotencyKey: key() });
    expect(res.body.data.operation).toMatchObject({ status: 'SOLDEE', paid: 12_000, remaining: 0, economy: 3_000, overrun: 0 });
    const m = (await u.get(`/api/budget/months/${month}`)).body.data;
    expect(m.summary).toMatchObject({ plannedExpense: 15_000, realExpense: 12_000, economy: 3_000 });
  });

  it('signale un dépassement quand on paie plus que prévu (CA-6)', async () => {
    const id = (await u.post('/api/budget/operations', op())).body.data.id;
    const res = await u.post(`/api/budget/operations/${id}/settle`, { amount: 17_500, accountId: cash, idempotencyKey: key() });
    expect(res.body.data.operation).toMatchObject({ status: 'SOLDEE', paid: 17_500, overrun: 2_500, economy: 0 });
  });

  it('un double appui avec la même clé ne crée aucune seconde écriture (CA-5)', async () => {
    const id = (await u.post('/api/budget/operations', op())).body.data.id;
    const k = key();
    const first = await u.post(`/api/budget/operations/${id}/settle`, { amount: 5_000, accountId: cash, idempotencyKey: k });
    const replay = await u.post(`/api/budget/operations/${id}/settle`, { amount: 5_000, accountId: cash, idempotencyKey: k });
    expect(first.status).toBe(201);
    expect(replay.status).toBe(200);
    expect(replay.body.data.replayed).toBe(true);
    expect(replay.body.data.transaction.id).toBe(first.body.data.transaction.id);
    expect(replay.body.data.operation).toMatchObject({ paid: 5_000, status: 'PARTIELLE' });
    expect(await prisma.transaction.count({ where: { plannedOperationId: id } })).toBe(1);
    expect((await u.get('/api/budget/accounts')).body.data[0].balance).toBe(-5_000);
  });

  it('cinq appuis simultanés avec la même clé : une seule écriture, cinq réponses valides (CA-5)', async () => {
    const id = (await u.post('/api/budget/operations', op())).body.data.id;
    const k = key();
    const results = await Promise.all(
      Array.from({ length: 5 }, () => u.post(`/api/budget/operations/${id}/settle`, { amount: 4_000, accountId: cash, idempotencyKey: k })),
    );
    expect(results.map((r) => r.status).sort()).toEqual([200, 200, 200, 200, 201]);
    expect(new Set(results.map((r) => r.body.data.transaction.id)).size).toBe(1);
    expect(await prisma.transaction.count({ where: { plannedOperationId: id } })).toBe(1);
    expect((await u.get('/api/budget/accounts')).body.data[0].balance).toBe(-4_000);
  });

  it('deux règlements simultanés avec des clés différentes restent cohérents (verrou sur la prévision)', async () => {
    const id = (await u.post('/api/budget/operations', op({ plannedAmount: 10_000 }))).body.data.id;
    const [a, b] = await Promise.all([
      u.post(`/api/budget/operations/${id}/settle`, { amount: 5_000, accountId: cash, idempotencyKey: key() }),
      u.post(`/api/budget/operations/${id}/settle`, { amount: 5_000, accountId: cash, idempotencyKey: key() }),
    ]);
    expect([a.status, b.status]).toEqual([201, 201]);
    const m = (await u.get(`/api/budget/months/${month}`)).body.data;
    expect(m.operations[0]).toMatchObject({ paid: 10_000, status: 'SOLDEE', remaining: 0 });
  });

  it('refuse une clé déjà utilisée pour une autre prévision, et exige une clé (CA-5)', async () => {
    const a = (await u.post('/api/budget/operations', op())).body.data.id;
    const b = (await u.post('/api/budget/operations', op({ label: 'Autre' }))).body.data.id;
    const k = key();
    await u.post(`/api/budget/operations/${a}/settle`, { amount: 1_000, accountId: cash, idempotencyKey: k });
    expect((await u.post(`/api/budget/operations/${b}/settle`, { amount: 1_000, accountId: cash, idempotencyKey: k })).status).toBe(409);
    expect((await u.post(`/api/budget/operations/${a}/settle`, { amount: 1_000, accountId: cash })).status).toBe(400);
    expect((await u.post(`/api/budget/operations/${a}/settle`, { amount: 1_000, accountId: cash, idempotencyKey: 'court' })).status).toBe(400);
  });

  it('modifie, annule et supprime une prévision', async () => {
    const id = (await u.post('/api/budget/operations', op())).body.data.id;
    await u.post(`/api/budget/operations/${id}/settle`, { amount: 5_000, accountId: cash, idempotencyKey: key() });

    const raised = await u.patch(`/api/budget/operations/${id}`, { plannedAmount: 20_000, label: 'Transport + impression' });
    expect(raised.body.data).toMatchObject({ plannedAmount: 20_000, status: 'PARTIELLE', remaining: 15_000, label: 'Transport + impression' });
    const lowered = await u.patch(`/api/budget/operations/${id}`, { plannedAmount: 4_000 });
    expect(lowered.body.data).toMatchObject({ status: 'SOLDEE', overrun: 1_000 });

    const cancelled = await u.patch(`/api/budget/operations/${id}`, { cancelled: true });
    expect(cancelled.body.data).toMatchObject({ status: 'ANNULEE', remaining: 0, overrun: 0 });
    expect((await u.post(`/api/budget/operations/${id}/settle`, { amount: 100, accountId: cash, idempotencyKey: key() })).status).toBe(409);
    expect((await u.patch(`/api/budget/operations/${id}`, { cancelled: false })).body.data.status).toBe('SOLDEE');

    expect((await u.del(`/api/budget/operations/${id}`)).status).toBe(200);
    // Le paiement réel déjà fait reste enregistré.
    expect(await prisma.transaction.count({ where: { label: 'Transport et impression' } })).toBe(1);
    expect((await u.del(`/api/budget/operations/${id}`)).status).toBe(404);
  });

  it('valide une prévision (libellé, date, type) (CA-1)', async () => {
    expect((await u.post('/api/budget/operations', op({ label: '' }))).status).toBe(400);
    expect((await u.post('/api/budget/operations', op({ dueDate: '31/12/2026' }))).status).toBe(400);
    expect((await u.post('/api/budget/operations', op({ type: 'CADEAU' }))).status).toBe(400);
  });
});

describe('transactions réelles', () => {
  it('enregistre une opération réelle et met à jour le solde (CA-7)', async () => {
    const res = await u.post('/api/budget/transactions', {
      type: 'REVENU',
      amount: 200_000,
      date: today,
      accountId: cash,
      categoryId: cat['Activité'],
      label: 'Facture école',
    });
    expect(res.status).toBe(201);
    await u.post('/api/budget/transactions', { type: 'DEPENSE', amount: 35_000, date: today, accountId: cash, categoryId: cat['Alimentation'] });
    await u.post('/api/budget/transactions', { type: 'EPARGNE', amount: 20_000, date: today, accountId: cash, categoryId: cat['Épargne'] });
    const acc = (await u.get('/api/budget/accounts')).body.data[0];
    expect(acc.balance).toBe(145_000);
  });

  it('rejoue une clé d’idempotence sans doublon', async () => {
    const k = key();
    const body = { type: 'DEPENSE', amount: 2_000, date: today, accountId: cash, idempotencyKey: k };
    expect((await u.post('/api/budget/transactions', body)).status).toBe(201);
    const replay = await u.post('/api/budget/transactions', body);
    expect(replay.status).toBe(200);
    expect(replay.body.data.replayed).toBe(true);
    expect(await prisma.transaction.count({ where: { idempotencyKey: k } })).toBe(1);
  });

  it('supprimer une transaction recalcule la prévision liée (CA-8)', async () => {
    const id = (await u.post('/api/budget/operations', op())).body.data.id;
    const t1 = (await u.post(`/api/budget/operations/${id}/settle`, { amount: 9_000, accountId: cash, idempotencyKey: key() })).body.data.transaction;
    const t2 = (await u.post(`/api/budget/operations/${id}/settle`, { amount: 3_000, accountId: cash, close: true, idempotencyKey: key() })).body.data.transaction;

    const afterSecond = await u.del(`/api/budget/transactions/${t2.id}`);
    expect(afterSecond.body.data.operation).toMatchObject({ status: 'PARTIELLE', paid: 9_000, remaining: 6_000, economy: 0, closedAt: null });
    const afterFirst = await u.del(`/api/budget/transactions/${t1.id}`);
    expect(afterFirst.body.data.operation).toMatchObject({ status: 'PREVUE', paid: 0 });
    expect((await u.del(`/api/budget/transactions/${t1.id}`)).status).toBe(404);
    expect((await u.get('/api/budget/accounts')).body.data[0].balance).toBe(0);

    const free = (await u.post('/api/budget/transactions', { type: 'DEPENSE', amount: 700, date: today, accountId: cash })).body.data.transaction;
    expect((await u.del(`/api/budget/transactions/${free.id}`)).body.data.operation).toBeNull();
  });
});

describe('vue du mois et enveloppes', () => {
  it('compare prévu et réel, par enveloppe (CA-7)', async () => {
    await u.put('/api/budget/envelopes', { month, categoryId: cat['Transport'], plannedAmount: 50_000 });
    await u.put('/api/budget/envelopes', { month, categoryId: cat['Alimentation'], plannedAmount: 80_000 });
    await u.post('/api/budget/operations', op({ type: 'REVENU', label: 'Salaire', plannedAmount: 300_000, categoryId: cat['Salaire'] }));
    const transport = (await u.post('/api/budget/operations', op({ categoryId: cat['Transport'] }))).body.data.id;
    await u.post(`/api/budget/operations/${transport}/settle`, { amount: 12_000, accountId: cash, close: true, idempotencyKey: key() });
    await u.post('/api/budget/transactions', { type: 'DEPENSE', amount: 95_000, date: today, accountId: cash, categoryId: cat['Alimentation'] });
    await u.post('/api/budget/transactions', { type: 'REVENU', amount: 100_000, date: today, accountId: cash, categoryId: cat['Salaire'] });

    const m = (await u.get(`/api/budget/months/${month}`)).body.data;
    expect(m.needsSetup).toBe(false);
    expect(m.summary).toMatchObject({
      plannedIncome: 300_000,
      plannedExpense: 15_000,
      realIncome: 100_000,
      realExpense: 107_000,
      remainingToSpend: -92_000,
      overspent: true,
      economy: 3_000,
    });
    expect(m.totalBalance).toBe(-7_000);
    const byName = Object.fromEntries(m.envelopes.map((e: { categoryName: string }) => [e.categoryName, e]));
    expect(byName['Transport']).toMatchObject({ planned: 50_000, spent: 12_000, remaining: 38_000, percent: 24, overspent: false });
    expect(byName['Alimentation']).toMatchObject({ planned: 80_000, spent: 95_000, remaining: -15_000, percent: 119, overspent: true });
    expect(byName['Salaire']).toBeUndefined(); // un revenu n'est pas une dépense d'enveloppe
    expect(m.operations).toHaveLength(2);
    expect(m.transactions).toHaveLength(3);
  });

  it('retire une enveloppe à 0, refuse une catégorie inconnue, un mois invalide ou un montant décimal', async () => {
    await u.put('/api/budget/envelopes', { month, categoryId: cat['Loisirs'], plannedAmount: 10_000 });
    expect((await u.get(`/api/budget/months/${month}`)).body.data.envelopes).toHaveLength(1);
    await u.put('/api/budget/envelopes', { month, categoryId: cat['Loisirs'], plannedAmount: 0 });
    expect((await u.get(`/api/budget/months/${month}`)).body.data.envelopes).toHaveLength(0);
    expect((await u.put('/api/budget/envelopes', { month, categoryId: '0b0b0b0b-0b0b-4b0b-8b0b-0b0b0b0b0b0b', plannedAmount: 5 })).status).toBe(404);
    expect((await u.put('/api/budget/envelopes', { month: '2026-13', categoryId: cat['Loisirs'], plannedAmount: 5 })).status).toBe(400);
    expect((await u.put('/api/budget/envelopes', { month, categoryId: cat['Loisirs'], plannedAmount: 5.5 })).status).toBe(400);
    expect((await u.get('/api/budget/months/2026-13')).status).toBe(400);
    expect((await u.get('/api/budget/months/novembre')).status).toBe(400);
  });

  it('sépare les mois et signale qu’il faut démarrer le budget', async () => {
    await u.post('/api/budget/operations', op({ dueDate: '2030-02-10' }));
    const feb = (await u.get('/api/budget/months/2030-02')).body.data;
    expect(feb.operations).toHaveLength(1);
    expect(feb.summary.plannedExpense).toBe(15_000);
    expect((await u.get('/api/budget/months/2030-03')).body.data.operations).toEqual([]);

    const fresh = await registerUser('Nouveau');
    expect((await fresh.get(`/api/budget/months/${month}`)).body.data).toMatchObject({ needsSetup: true, accounts: [] });
  });
});

describe('confidentialité (CA-10)', () => {
  it('ne journalise ni montant, ni clé, ni corps de requête', async () => {
    const spies = [vi.spyOn(console, 'log'), vi.spyOn(console, 'error'), vi.spyOn(console, 'warn'), vi.spyOn(console, 'info')];
    const id = (await u.post('/api/budget/operations', op({ plannedAmount: 123_456 }))).body.data.id;
    await u.post(`/api/budget/operations/${id}/settle`, { amount: 654_321, accountId: cash, idempotencyKey: 'cle-secrete-12345' });
    await u.post(`/api/budget/operations/${id}/settle`, { amount: 1, accountId: cash, idempotencyKey: 'cle-secrete-12345' });
    await u.post('/api/budget/transactions', { type: 'DEPENSE', amount: 0.5, date: today, accountId: cash });
    const logged = spies.flatMap((s) => s.mock.calls.flat().map(String)).join(' ');
    expect(logged).not.toMatch(/123456|654321|cle-secrete/);
  });
});
