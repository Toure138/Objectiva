// Scénarios de parité (spec 007). Données pures : aucune dépendance, aucun accès réseau.
//
// Un scénario est une suite d'appels à l'API REST d'Objectiva. Il est joué :
//   - contre le vrai serveur (backend/tests/parity) : les réponses sont comparées aux fichiers de
//     référence du dossier `golden/` ;
//   - plus tard contre le moteur local du téléphone : mêmes appels, mêmes réponses attendues.
// C'est ce qui garantit que le calcul hors connexion donne exactement le même résultat que le serveur.
//
// Pour régénérer les références après un changement VOLONTAIRE de comportement :
//   cd backend && UPDATE_GOLDEN=1 npx vitest run tests/parity   (puis relire le diff Git)

export type Method = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

export interface Step {
  method: Method;
  /** Peut contenir `{{nom}}` : remplacé par un identifiant mémorisé avec `save`. */
  path: string;
  body?: unknown;
  /** Mémorise une valeur de la réponse : `{ tx1: 'data.transaction.id' }`. */
  save?: Record<string, string>;
  /** Statut HTTP attendu (par défaut : 200 ou 201). */
  expect?: number;
  /** N'apparaît pas dans le fichier de référence (étape de mise en place). */
  silent?: boolean;
}

export interface Scenario {
  name: string;
  /** Fuseau horaire de l'utilisateur du scénario. */
  timezone: string;
  steps: Step[];
}

/** Instant figé pour tous les scénarios : le mercredi 4 novembre 2026, 09:00 UTC. L'horloge avance d'une seconde par étape. */
export const FROZEN_NOW = '2026-11-04T09:00:00.000Z';

/** Identifiant fixe et lisible : les scénarios créent leurs données avec des identifiants d'appareil. */
export const uid = (n: number): string => `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;

const get = (path: string): Step => ({ method: 'GET', path });
const post = (path: string, body?: unknown, extra: Partial<Step> = {}): Step => ({ method: 'POST', path, body, ...extra });
const patch = (path: string, body: unknown, extra: Partial<Step> = {}): Step => ({ method: 'PATCH', path, body, ...extra });
const del = (path: string, extra: Partial<Step> = {}): Step => ({ method: 'DELETE', path, ...extra });

// ---------------------------------------------------------------------------------------------
// 1. Tâches, jalons, « Aujourd'hui » et bilans

const GOAL = uid(1);
const M1 = uid(2);
const M2 = uid(3);
const [TA, TB, TC, TD, TE] = [uid(11), uid(12), uid(13), uid(14), uid(15)];

export const tachesEtBilan: Scenario = {
  name: 'taches-et-bilan',
  timezone: 'Africa/Abidjan',
  steps: [
    post('/api/goals', {
      id: GOAL,
      title: 'Présenter EcoleSaaS à trois établissements',
      category: 'CARRIERE',
      status: 'EN_COURS',
      priority: 'HAUTE',
      startDate: '2026-10-01',
      endDate: '2027-06-30',
    }),
    post(`/api/goals/${GOAL}/milestones`, { id: M1, title: 'Première démonstration', dueDate: '2026-11-20' }),
    post(`/api/goals/${GOAL}/milestones`, { id: M2, title: 'Deuxième démonstration', dueDate: '2026-12-20' }),
    post('/api/tasks', { id: TA, title: 'Préparer les comptes de démonstration', goalId: GOAL, milestoneId: M1, workDate: '2026-11-04' }),
    post('/api/tasks', { id: TB, title: 'Appeler le directeur', goalId: GOAL, workDate: '2026-11-05', dueDate: '2026-11-07' }),
    post('/api/tasks', { id: TC, title: 'Footing 5 km', workDate: '2026-11-03' }),
    post('/api/tasks', { id: TD, title: 'Trier les photos' }),
    post('/api/tasks', { id: TE, title: 'Payer la facture d’électricité', workDate: '2026-11-04', dueDate: '2026-11-02' }),
    post(`/api/tasks/${TA}/complete`),
    post(`/api/tasks/${TB}/reschedule`, { workDate: '2026-11-06' }),
    post(`/api/tasks/${TB}/reschedule`, { workDate: '2026-11-09' }),
    post(`/api/tasks/${TB}/reschedule`, { workDate: '2026-11-10' }),
    post(`/api/tasks/${TD}/cancel`),
    patch(`/api/milestones/${M1}`, { completed: true }),
    post(`/api/tasks/${TA}/reopen`),
    post(`/api/tasks/${TA}/complete`),
    post(`/api/tasks/${TA}/complete`),
    patch(`/api/tasks/${TE}`, { title: 'Payer la facture d’électricité (urgent)', workDate: null }),
    get('/api/today'),
    get('/api/today?date=2026-11-05'),
    get('/api/tasks?status=TODO'),
    get('/api/tasks?unscheduled=true'),
    get(`/api/tasks?goalId=${GOAL}`),
    get('/api/tasks?from=2026-11-03&to=2026-11-05'),
    get('/api/goals'),
    get(`/api/goals/${GOAL}`),
    get('/api/reviews?period=day&date=2026-11-04'),
    get('/api/reviews?period=week&date=2026-11-04'),
    get('/api/reviews?period=month&date=2026-11-04'),
    get('/api/reviews?from=2026-12-01&to=2026-12-31'),
    del(`/api/milestones/${M2}`),
    del(`/api/goals/${GOAL}`),
    get('/api/tasks'),
    get('/api/goals'),
  ],
};

// ---------------------------------------------------------------------------------------------
// 2. Progression mesurée

const G2 = uid(21);
const [R1, R2, R3] = [uid(22), uid(23), uid(24)];

export const progressionMesuree: Scenario = {
  name: 'progression-mesuree',
  timezone: 'Africa/Abidjan',
  steps: [
    post('/api/goals', {
      id: G2,
      title: 'Présenter EcoleSaaS à trois établissements',
      category: 'CARRIERE',
      status: 'EN_COURS',
      startDate: '2026-10-01',
      endDate: '2027-06-30',
      progressMode: 'MESURE',
      measureUnit: 'démonstrations',
      startValue: 0,
      targetValue: 3,
    }),
    get(`/api/goals/${G2}`),
    post(`/api/goals/${G2}/readings`, { id: R1, value: 1, readOn: '2026-11-02', note: 'Collège Les Palmiers' }),
    post(`/api/goals/${G2}/readings`, { id: R2, value: 2, readOn: '2026-11-03' }),
    post(`/api/goals/${G2}/readings`, { id: R3, value: 3 }),
    get(`/api/goals/${G2}`),
    { method: 'DELETE', path: `/api/readings/${R3}` },
    get('/api/goals'),
    patch(`/api/goals/${G2}`, { progressMode: 'JALONS' }),
    get(`/api/goals/${G2}`),
    patch(`/api/goals/${G2}`, { progressMode: 'MESURE' }),
    post('/api/goals', { id: uid(25), title: 'Perdre du poids', category: 'SANTE', startDate: '2026-10-01', endDate: '2027-02-01', progressMode: 'MESURE', measureUnit: 'kg', startValue: 80, targetValue: 72 }),
    post(`/api/goals/${uid(25)}/readings`, { id: uid(26), value: 76, readOn: '2026-11-01' }),
    get('/api/goals'),
    get('/api/reviews?period=month&date=2026-11-04'),
    post('/api/goals', { id: uid(27), title: 'Invalide', category: 'SANTE', startDate: '2026-10-01', endDate: '2027-02-01', progressMode: 'MESURE', measureUnit: 'kg', startValue: 5, targetValue: 5 }, { expect: 400 }),
    post(`/api/goals/${uid(25)}/readings`, { value: 70.5 }, { expect: 400 }),
  ],
};

// ---------------------------------------------------------------------------------------------
// 3. Événements (fuseau Europe/Paris : heure d'hiver, puis changement d'heure de mars 2027)

const G3 = uid(31);
const [E1, E2, E3, E4, E5] = [uid(32), uid(33), uid(34), uid(35), uid(36)];

export const evenements: Scenario = {
  name: 'evenements',
  timezone: 'Europe/Paris',
  steps: [
    patch('/api/auth/me', { timezone: 'Europe/Paris' }, { silent: true }),
    post('/api/goals', { id: G3, title: 'Présenter EcoleSaaS', category: 'CARRIERE', status: 'EN_COURS', startDate: '2026-10-01', endDate: '2027-06-30' }),
    post('/api/events', {
      id: E1,
      type: 'REUNION',
      title: 'Démonstration au collège Les Palmiers',
      date: '2026-11-05',
      startTime: '10:00',
      endTime: '11:30',
      location: 'Collège Les Palmiers',
      participants: ['M. Koné (directeur)', 'Mme Traoré'],
      agenda: 'Présenter EcoleSaaS',
      travelBeforeMinutes: 45,
      prepBeforeMinutes: 30,
      goalId: G3,
    }),
    post('/api/events', { id: E2, type: 'APPEL', title: 'Appel avec le comptable', date: '2026-11-04', startTime: '17:00', endTime: '17:30' }),
    post('/api/events', { id: E3, type: 'VISIO', title: 'Visio de nuit', date: '2026-11-06', startTime: '00:30', endTime: '01:00', link: 'https://meet.exemple.fr/salle-12' }),
    post('/api/events', { id: E4, type: 'RENDEZ_VOUS', title: 'Avant le changement d’heure', date: '2027-03-28', startTime: '01:30', endTime: '01:45' }),
    post('/api/events', { id: E5, type: 'RENCONTRE', title: 'Après le changement d’heure', date: '2027-03-28', startTime: '03:30', endTime: '04:00' }),
    post('/api/events', { id: uid(37), type: 'APPEL', title: 'Fin avant début', date: '2026-11-05', startTime: '12:00', endTime: '11:00' }, { expect: 400 }),
    post('/api/events', { id: uid(38), type: 'VISIO', title: 'Lien dangereux', date: '2026-11-05', startTime: '12:00', endTime: '13:00', link: 'javascript:alert(1)' }, { expect: 400 }),
    post(`/api/events/${E1}/tasks`, { role: 'PREPARATION' }),
    post(`/api/events/${E1}/tasks`, { role: 'SUIVI', title: 'Envoyer le devis', workDate: null }),
    post(`/api/events/${E2}/tasks`, { role: 'PREPARATION' }),
    post(`/api/events/${E1}/complete`, { decisions: 'Pilote validé pour janvier. Envoyer le devis.' }),
    post(`/api/events/${E1}/complete`, {}),
    post(`/api/events/${E1}/cancel`, undefined, { expect: 409 }),
    post(`/api/events/${E3}/cancel`),
    post(`/api/events/${E3}/cancel`),
    post(`/api/events/${E3}/complete`, {}, { expect: 409 }),
    post(`/api/events/${E3}/reopen`),
    patch(`/api/events/${E2}`, { startTime: '16:00', endTime: '16:45', title: 'Appel avec le comptable (avancé)' }),
    patch(`/api/events/${E2}`, { startTime: '17:00' }, { expect: 400 }),
    get('/api/events?from=2026-11-01&to=2026-11-30'),
    get('/api/events?status=PREVU'),
    get('/api/events?from=2027-03-28&to=2027-03-28'),
    get(`/api/events/${E1}`),
    get('/api/today?date=2026-11-05'),
    get('/api/today'),
    get('/api/reviews?period=day&date=2026-11-05'),
    get('/api/reviews?period=month&date=2026-11-04'),
    del(`/api/events/${E4}`),
    get('/api/events'),
  ],
};

// ---------------------------------------------------------------------------------------------
// 4. Budget mensuel

const CASH = uid(41);
const ORANGE = uid(42);
const [C_TRANSPORT, C_FOOD, C_SALARY, C_SAVING] = [uid(43), uid(44), uid(45), uid(46)];
const [OP1, OP2, OP3] = [uid(47), uid(48), uid(49)];

export const budgetMensuel: Scenario = {
  name: 'budget-mensuel',
  timezone: 'Africa/Abidjan',
  steps: [
    post('/api/budget/accounts', { id: CASH, name: 'Espèces', kind: 'ESPECES', openingBalance: 150_000 }),
    post('/api/budget/accounts', { id: ORANGE, name: 'Orange Money', kind: 'MOBILE_MONEY', openingBalance: 25_000 }),
    post('/api/budget/categories', { id: C_TRANSPORT, name: 'Transport', type: 'DEPENSE' }),
    post('/api/budget/categories', { id: C_FOOD, name: 'Alimentation', type: 'DEPENSE' }),
    post('/api/budget/categories', { id: C_SALARY, name: 'Activité', type: 'REVENU' }),
    post('/api/budget/categories', { id: C_SAVING, name: 'Épargne', type: 'EPARGNE' }),
    post('/api/budget/accounts', { name: 'Espèces', kind: 'BANQUE' }, { expect: 409 }),
    post('/api/budget/operations', { id: OP1, type: 'DEPENSE', label: 'Transport et impression', plannedAmount: 15_000, dueDate: '2026-11-05', categoryId: C_TRANSPORT }),
    post('/api/budget/operations', { id: OP2, type: 'REVENU', label: 'Facture école pilote', plannedAmount: 200_000, dueDate: '2026-11-25', categoryId: C_SALARY, accountId: ORANGE }),
    post('/api/budget/operations', { id: OP3, type: 'EPARGNE', label: 'Épargne projet', plannedAmount: 20_000, dueDate: '2026-11-28', categoryId: C_SAVING }),
    post('/api/budget/operations', { type: 'DEPENSE', label: 'Montant décimal', plannedAmount: 10.5, dueDate: '2026-11-05' }, { expect: 400 }),
    post('/api/budget/operations', { type: 'DEPENSE', label: 'Mauvaise catégorie', plannedAmount: 1_000, dueDate: '2026-11-05', categoryId: C_SALARY }, { expect: 400 }),
    post(`/api/budget/operations/${OP1}/settle`, { amount: 9_000, accountId: CASH, date: '2026-11-05', idempotencyKey: 'parite-reglement-0001' }, { save: { tx1: 'data.transaction.id' } }),
    // Double appui : même clé, même résultat, aucune seconde écriture.
    post(`/api/budget/operations/${OP1}/settle`, { amount: 9_000, accountId: CASH, date: '2026-11-05', idempotencyKey: 'parite-reglement-0001' }, { expect: 200 }),
    post(`/api/budget/operations/${OP1}/settle`, { amount: 3_000, accountId: CASH, date: '2026-11-06', close: true, idempotencyKey: 'parite-reglement-0002' }, { save: { tx2: 'data.transaction.id' } }),
    post(`/api/budget/operations/${OP1}/settle`, { amount: 500, accountId: CASH, idempotencyKey: 'parite-reglement-0003' }, { expect: 409 }),
    post(`/api/budget/operations/${OP2}/settle`, { amount: 120_000, accountId: ORANGE, date: '2026-11-20', idempotencyKey: 'parite-reglement-0004' }),
    post('/api/budget/transactions', { type: 'DEPENSE', amount: 12_500, date: '2026-11-02', accountId: CASH, categoryId: C_FOOD, label: 'Courses', idempotencyKey: 'parite-courses-0001' }),
    post('/api/budget/transactions', { type: 'DEPENSE', amount: 12_500, date: '2026-11-02', accountId: CASH, categoryId: C_FOOD, label: 'Courses', idempotencyKey: 'parite-courses-0001' }, { expect: 200 }),
    post('/api/budget/transactions', { type: 'EPARGNE', amount: 20_000, date: '2026-11-03', accountId: ORANGE, categoryId: C_SAVING }),
    { method: 'PUT', path: '/api/budget/envelopes', body: { month: '2026-11', categoryId: C_TRANSPORT, plannedAmount: 50_000 } },
    { method: 'PUT', path: '/api/budget/envelopes', body: { month: '2026-11', categoryId: C_FOOD, plannedAmount: 8_000 } },
    get('/api/budget/months/2026-11'),
    get('/api/budget/accounts'),
    patch(`/api/budget/operations/${OP3}`, { plannedAmount: 25_000, label: 'Épargne projet (relevée)' }),
    patch(`/api/budget/operations/${OP3}`, { cancelled: true }),
    patch(`/api/budget/operations/${OP3}`, { cancelled: false }),
    del('/api/budget/transactions/{{tx2}}'),
    get('/api/budget/months/2026-11'),
    del('/api/budget/transactions/{{tx1}}'),
    get('/api/budget/months/2026-11'),
    patch(`/api/budget/accounts/${ORANGE}`, { archived: true }),
    get('/api/budget/accounts'),
    get('/api/budget/months/2026-12'),
    { method: 'GET', path: '/api/budget/months/2026-13', expect: 400 },
  ],
};


// ---------------------------------------------------------------------------------------------
// 5. Ordre des listes : mêmes tris et mêmes départages sur le serveur et sur le téléphone

const [GA, GB, GC, GM] = [uid(51), uid(52), uid(53), uid(54)];
const [MS1, MS2, MS3, MS4] = [uid(55), uid(56), uid(57), uid(58)];
const T = (n: number): string => uid(60 + n);

export const ordreDesListes: Scenario = {
  name: 'ordre-des-listes',
  timezone: 'Africa/Abidjan',
  steps: [
    // Objectifs : tri par échéance, puis par création (GA et GC ont la même échéance).
    post('/api/goals', { id: GB, title: 'Zoologie', category: 'ETUDES', status: 'EN_COURS', startDate: '2026-10-01', endDate: '2027-03-01' }),
    post('/api/goals', { id: GA, title: 'Algèbre', category: 'ETUDES', status: 'EN_COURS', startDate: '2026-10-01', endDate: '2027-01-01' }),
    post('/api/goals', { id: GC, title: 'Chimie', category: 'SANTE', status: 'A_DEMARRER', startDate: '2026-10-01', endDate: '2027-01-01' }),
    post('/api/goals', { id: GM, title: 'Courir', category: 'SANTE', status: 'EN_PAUSE', startDate: '2026-10-01', endDate: '2027-02-01', progressMode: 'MESURE', measureUnit: 'km', startValue: 0, targetValue: 10 }),
    // Jalons : échéance croissante, sans échéance en dernier, puis création.
    post(`/api/goals/${GA}/milestones`, { id: MS1, title: 'Sans date (premier)' }),
    post(`/api/goals/${GA}/milestones`, { id: MS2, title: 'Décembre', dueDate: '2026-12-01' }),
    post(`/api/goals/${GA}/milestones`, { id: MS3, title: 'Novembre', dueDate: '2026-11-01' }),
    post(`/api/goals/${GA}/milestones`, { id: MS4, title: 'Sans date (second)' }),
    // Relevés : date décroissante, puis création décroissante.
    post(`/api/goals/${GM}/readings`, { id: uid(70), value: 2, readOn: '2026-11-01' }),
    post(`/api/goals/${GM}/readings`, { id: uid(71), value: 5, readOn: '2026-11-03' }),
    post(`/api/goals/${GM}/readings`, { id: uid(72), value: 4, readOn: '2026-11-03' }),
    post(`/api/goals/${GM}/readings`, { id: uid(73), value: 3, readOn: '2026-11-02' }),
    // Tâches du jour : l'ordre alphabétique n'est PAS l'ordre de création.
    post('/api/tasks', { id: T(1), title: 'Zèbre', workDate: '2026-11-04', goalId: GA }),
    post('/api/tasks', { id: T(2), title: 'Abeille', workDate: '2026-11-04' }),
    post('/api/tasks', { id: T(3), title: 'Mouette', workDate: '2026-11-04' }),
    post('/api/tasks', { id: T(4), title: 'Sans date 1' }),
    post('/api/tasks', { id: T(5), title: 'Sans date 2', goalId: GA }),
    // À replanifier : date de travail croissante, puis création.
    post('/api/tasks', { id: T(6), title: 'Hier B', workDate: '2026-11-03' }),
    post('/api/tasks', { id: T(7), title: 'Avant-hier', workDate: '2026-11-02' }),
    post('/api/tasks', { id: T(8), title: 'Hier A', workDate: '2026-11-03' }),
    // En retard : échéance croissante, puis création (deux échéances identiques).
    post('/api/tasks', { id: T(9), title: 'Retard 1er nov. (A)', dueDate: '2026-11-01' }),
    post('/api/tasks', { id: T(10), title: 'Retard 30 oct.', dueDate: '2026-10-30', workDate: '2026-11-09' }),
    post('/api/tasks', { id: T(11), title: 'Retard 1er nov. (B)', dueDate: '2026-11-01' }),
    // Prochaine action de GA : la plus proche, les tâches sans date après.
    post('/api/tasks', { id: T(12), title: 'GA lointaine', goalId: GA, workDate: '2026-12-20' }),
    post('/api/tasks', { id: T(13), title: 'GA proche', goalId: GA, workDate: '2026-11-06' }),
    // Terminées dans le désordre : tri par heure de réalisation.
    post(`/api/tasks/${T(3)}/complete`),
    post(`/api/tasks/${T(1)}/complete`),
    post(`/api/tasks/${T(2)}/complete`),
    get('/api/today'),
    get('/api/today?date=2026-11-09'),
    get('/api/tasks'),
    get('/api/tasks?limit=4&offset=0'),
    get('/api/tasks?limit=4&offset=4'),
    get('/api/tasks?status=TODO&limit=5&offset=5'),
    get('/api/tasks?from=2026-11-02&to=2026-11-04'),
    get('/api/tasks?unscheduled=true'),
    get(`/api/tasks?goalId=${GA}`),
    get('/api/goals'),
    get('/api/goals?status=EN_COURS'),
    get('/api/goals?category=SANTE'),
    get(`/api/goals/${GA}`),
    get(`/api/goals/${GM}`),
    get('/api/reviews?period=week&date=2026-11-04'),
    { method: 'GET', path: '/api/tasks?limit=0', expect: 400 },
  ],
};

export const SCENARIOS: Scenario[] = [tachesEtBilan, progressionMesuree, evenements, budgetMensuel, ordreDesListes];
