import { beforeEach, describe, expect, it } from 'vitest';
import { todayIn } from '../../src/core/dates.ts';
import { prisma } from '../../src/core/prisma.ts';
import { registerUser, resetDb, type TestUser } from '../helpers.ts';

// Spec 006 : scénario d'acceptation EcoleSaaS de l'étape 2.
// Hypothèse (voir la spec) : reconstitué à partir des indices du dépôt, la « section 11 » de la
// mission n'étant pas disponible. Un seul test, volontairement séquentiel : il raconte le parcours.

const today = todayIn('Africa/Abidjan');
const shift = (days: number) => {
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
const tomorrow = shift(1);
const month = tomorrow.slice(0, 7);

let aminata: TestUser;
beforeEach(async () => {
  await resetDb();
  aminata = await registerUser('Aminata');
});

describe('scénario EcoleSaaS : première démonstration', () => {
  it('prépare, réalise et budgète une démonstration, puis la progression passe à 1 sur 3', async () => {
    // 1. L'objectif, en progression mesurée : 0 → 3 démonstrations.
    const goal = (
      await aminata.post('/api/goals', {
        title: 'Présenter EcoleSaaS à trois établissements',
        category: 'CARRIERE',
        status: 'EN_COURS',
        startDate: shift(-10),
        endDate: '2027-06-30',
        progressMode: 'MESURE',
        measureUnit: 'démonstrations',
        startValue: 0,
        targetValue: 3,
      })
    ).body.data;
    expect(goal.progress).toMatchObject({ mode: 'MESURE', percent: 0, label: '0 sur 3 démonstrations' });

    // 2. La réunion de demain, avec lieu, participant, ordre du jour, déplacement et préparation.
    const event = (
      await aminata.post('/api/events', {
        type: 'REUNION',
        title: 'Démonstration au collège Les Palmiers',
        date: tomorrow,
        startTime: '10:00',
        endTime: '11:30',
        location: 'Collège Les Palmiers, Cocody',
        participants: ['M. Koné, directeur'],
        agenda: 'Présenter EcoleSaaS, recueillir les besoins, proposer un pilote.',
        travelBeforeMinutes: 45,
        prepBeforeMinutes: 30,
        goalId: goal.id,
      })
    ).body.data;
    expect(event).toMatchObject({
      status: 'PREVU',
      goalId: goal.id,
      startTime: '10:00',
      blockedMinutes: 75,
      blockedFromTime: '08:45',
      leaveAtTime: '09:15',
    });

    // 3. Une tâche de préparation liée à l'événement (aujourd'hui, la veille), qu'elle coche.
    const prep = (await aminata.post(`/api/events/${event.id}/tasks`, { role: 'PREPARATION' })).body.data;
    expect(prep).toMatchObject({ eventId: event.id, eventRole: 'PREPARATION', goalId: goal.id, workDate: today });
    expect((await aminata.post(`/api/tasks/${prep.id}/complete`)).body.data.status).toBe('DONE');

    // 4. Le budget : démarrage, prévision de 15 000 XOF « Transport et impression ».
    const setup = (await aminata.post('/api/budget/setup')).body.data;
    const cash = setup.accounts[0].id as string;
    const transport = setup.categories.find((c: { name: string }) => c.name === 'Transport').id as string;
    const operation = (
      await aminata.post('/api/budget/operations', {
        type: 'DEPENSE',
        label: 'Transport et impression',
        plannedAmount: 15_000,
        dueDate: tomorrow,
        categoryId: transport,
      })
    ).body.data;
    expect(operation).toMatchObject({ status: 'PREVUE', remaining: 15_000 });

    // 5. Le jour J : 9 000 puis 3 000, avec un double appui sur le premier paiement, puis on solde.
    const first = { amount: 9_000, accountId: cash, date: tomorrow, idempotencyKey: 'edu-paiement-0001' };
    const paid = await aminata.post(`/api/budget/operations/${operation.id}/settle`, first);
    const doubleTap = await aminata.post(`/api/budget/operations/${operation.id}/settle`, first);
    expect(paid.status).toBe(201);
    expect(doubleTap.status).toBe(200);
    expect(doubleTap.body.data.replayed).toBe(true);
    expect(await prisma.transaction.count({ where: { plannedOperationId: operation.id } })).toBe(1);

    const closed = (
      await aminata.post(`/api/budget/operations/${operation.id}/settle`, {
        amount: 3_000,
        accountId: cash,
        date: tomorrow,
        close: true,
        idempotencyKey: 'edu-paiement-0002',
      })
    ).body.data.operation;
    expect(closed).toMatchObject({ status: 'SOLDEE', paid: 12_000, economy: 3_000, remaining: 0, overrun: 0 });

    const budget = (await aminata.get(`/api/budget/months/${month}`)).body.data;
    expect(budget.currency).toBe('XOF');
    expect(budget.summary).toMatchObject({ plannedExpense: 15_000, realExpense: 12_000, economy: 3_000, expensePercent: 80, overspent: false });
    expect(budget.accounts[0].balance).toBe(-12_000);

    // 6. Elle marque la réunion « Réalisée » avec les décisions, puis crée l'action de suivi.
    const done = (await aminata.post(`/api/events/${event.id}/complete`, { decisions: 'Pilote validé pour janvier. Envoyer le devis.' })).body.data;
    expect(done).toMatchObject({ status: 'REALISE', decisions: 'Pilote validé pour janvier. Envoyer le devis.' });
    const followUp = (await aminata.post(`/api/events/${event.id}/tasks`, { role: 'SUIVI', title: 'Envoyer le devis au collège' })).body.data;
    expect(followUp).toMatchObject({ eventRole: 'SUIVI', goalId: goal.id, workDate: shift(2), status: 'TODO' });

    // 7. Elle enregistre le relevé : 1 démonstration sur 3.
    const reading = (await aminata.post(`/api/goals/${goal.id}/readings`, { value: 1, readOn: tomorrow, note: 'Collège Les Palmiers' })).body.data;
    expect(reading.progress).toMatchObject({ current: 1, percent: 33, reached: false, label: '1 sur 3 démonstrations' });

    // 8. « Aujourd'hui », « Planifier », la fiche de l'objectif et le bilan reflètent tout cela.
    const day = (await aminata.get(`/api/today?date=${tomorrow}`)).body.data;
    expect(day.events).toHaveLength(1);
    expect(day.events[0]).toMatchObject({ id: event.id, status: 'REALISE', title: 'Démonstration au collège Les Palmiers' });

    const week = (await aminata.get(`/api/events?from=${today}&to=${shift(6)}`)).body.data;
    expect(week.map((e: { id: string }) => e.id)).toEqual([event.id]);

    const goalDetail = (await aminata.get(`/api/goals/${goal.id}`)).body.data;
    expect(goalDetail.progress).toMatchObject({ percent: 33, label: '1 sur 3 démonstrations' });
    expect(goalDetail.readings).toHaveLength(1);
    expect(goalDetail.tasks.map((t: { eventRole: string }) => t.eventRole).sort()).toEqual(['PREPARATION', 'SUIVI']);
    expect(goalDetail.nextAction).toMatchObject({ id: followUp.id });
    expect(goalDetail.needsNextAction).toBe(false);

    const review = (await aminata.get(`/api/reviews?period=day&date=${tomorrow}`)).body.data;
    expect(review.events).toEqual({ planned: 0, done: 1, cancelled: 0, expected: 1 });
    expect(review.goals[0].progress).toMatchObject({ mode: 'MESURE', percent: 33 });

    const eventDetail = (await aminata.get(`/api/events/${event.id}`)).body.data;
    expect(eventDetail.tasks).toHaveLength(2);

    // 9. Un autre utilisateur ne voit aucune de ces données.
    const other = await registerUser('Koffi');
    expect((await other.get('/api/goals')).body.data).toEqual([]);
    expect((await other.get('/api/events')).body.data).toEqual([]);
    expect((await other.get(`/api/today?date=${tomorrow}`)).body.data.events).toEqual([]);
    expect((await other.get(`/api/events/${event.id}`)).status).toBe(404);
    expect((await other.get(`/api/goals/${goal.id}`)).status).toBe(404);
    const otherBudget = (await other.get(`/api/budget/months/${month}`)).body.data;
    expect(otherBudget).toMatchObject({ needsSetup: true, operations: [], transactions: [], accounts: [] });
    expect((await other.post(`/api/budget/operations/${operation.id}/settle`, { amount: 1_000, accountId: cash, idempotencyKey: 'autre-cle-0001' })).status).toBe(404);
    expect((await other.post(`/api/goals/${goal.id}/readings`, { value: 3 })).status).toBe(404);
  });
});
