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

const get = (path: string, extra: Partial<Step> = {}): Step => ({ method: 'GET', path, ...extra });
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

// ---------------------------------------------------------------------------------------------
// 6. Réunions récurrentes et agenda du jour (spec 009). Mercredi 4 novembre 2026, Europe/Paris.

const [DAILY, WEEKLY, BANK] = [uid(81), uid(82), uid(83)];
const MEETING = { type: 'REUNION', startTime: '09:00', endTime: '09:15' };

export const reunionsRecurrentes: Scenario = {
  name: 'reunions-recurrentes',
  timezone: 'Europe/Paris',
  steps: [
    patch('/api/auth/me', { timezone: 'Europe/Paris' }, { silent: true }),
    // En semaine à 9 h, à partir d'aujourd'hui (mercredi).
    post('/api/events', { ...MEETING, id: DAILY, title: 'Point quotidien', date: '2026-11-04', repeat: { weekdays: [5, 1, 2, 3, 4, 1] } }, { save: { d1: 'data.id' } }),
    // Chaque jeudi jusqu'à fin décembre, avec 15 min de trajet.
    post(
      '/api/events',
      { id: WEEKLY, type: 'RENCONTRE', title: 'Revue hebdo', date: '2026-11-05', startTime: '14:00', endTime: '15:00', travelBeforeMinutes: 15, repeat: { weekdays: [4], until: '2026-12-31' } },
      { save: { w1: 'data.id' } },
    ),
    // Un rendez-vous unique qui chevauche le point du jeudi, avec 30 min de préparation.
    post('/api/events', { id: BANK, type: 'RENDEZ_VOUS', title: 'Banque', date: '2026-11-05', startTime: '09:10', endTime: '09:45', prepBeforeMinutes: 30 }),
    // Répétitions invalides.
    post('/api/events', { ...MEETING, title: 'Sans jour', date: '2026-11-04', repeat: { weekdays: [] } }, { expect: 400 }),
    post('/api/events', { ...MEETING, title: 'Jour inconnu', date: '2026-11-04', repeat: { weekdays: [8] } }, { expect: 400 }),
    post('/api/events', { ...MEETING, title: 'Fin avant début', date: '2026-11-04', repeat: { weekdays: [1], until: '2026-11-01' } }, { expect: 400 }),
    post('/api/events', { ...MEETING, title: 'Aucune date', date: '2026-11-02', repeat: { weekdays: [5], until: '2026-11-03' } }, { expect: 400 }),
    get('/api/agenda?date=2026-11-05', { save: { d2: 'data.events.0.id' } }),
    get('/api/events?from=2026-11-02&to=2026-11-08'),
    get('/api/agenda?date=2026-11-06', { save: { d3: 'data.events.0.id' } }),
    // Cette occurrence seulement : vendredi à 10 h.
    patch('/api/events/{{d3}}', { startTime: '10:00', endTime: '10:15' }),
    // Cette occurrence et les suivantes : seuls le titre et le lieu changent (vendredi garde 10 h).
    patch('/api/events/{{d1}}?scope=following', { title: 'Point d’équipe', location: 'Salle B' }),
    patch('/api/events/{{d1}}?scope=following', { date: '2026-11-05' }, { expect: 400 }),
    patch('/api/events/{{d1}}', { repeat: { weekdays: [1] } }, { expect: 400 }),
    patch(`/api/events/${BANK}`, { repeat: { weekdays: [1] } }, { expect: 400 }),
    // Annuler cette fois (jeudi), puis réaliser mercredi.
    del('/api/events/{{d2}}?scope=occurrence'),
    post('/api/events/{{d1}}/complete', { decisions: 'Démo prête pour jeudi prochain.' }),
    get('/api/agenda?date=2026-11-09', { save: { d4: 'data.events.0.id' } }),
    // À partir de lundi 9 : lundi, mercredi et vendredi seulement (la série est coupée).
    patch('/api/events/{{d4}}?scope=following', { repeat: { weekdays: [1, 3, 5] } }, { save: { n1: 'data.id', s2: 'data.seriesId' } }),
    get('/api/events?from=2026-11-04&to=2026-11-13'),
    get('/api/agenda?date=2026-11-12', { save: { w2: 'data.events.0.id' } }),
    // La revue hebdo s'arrête après celle du 5.
    del('/api/events/{{w2}}?scope=following'),
    get('/api/events/{{w1}}'),
    post('/api/events/{{d1}}/tasks', { role: 'SUIVI', title: 'Envoyer le compte rendu' }),
    get('/api/today?date=2026-11-05'),
    get('/api/reviews?period=week&date=2026-11-04'),
    get('/api/agenda?date=2026-11-05'),
    get('/api/agenda'),
    // Toute la nouvelle série disparaît ; la tâche de suivi de l'ancienne reste, détachée, quand on supprime celle-ci.
    del('/api/events/{{n1}}?scope=series'),
    del('/api/events/{{d1}}?scope=series'),
    get('/api/events?from=2026-11-04&to=2026-11-13'),
    get('/api/tasks'),
    { method: 'GET', path: '/api/events/{{d1}}', expect: 404 },
    { method: 'DELETE', path: '/api/events/{{w1}}?scope=tout', expect: 400 },
  ],
};

// ---------------------------------------------------------------------------------------------
// 7. Vue d'ensemble : calendrier du mois et réunions récurrentes (spec 010). Mercredi 4 novembre 2026.

const [VG, COURS, FOOTING, ANCIENNE] = [uid(91), uid(92), uid(93), uid(94)];

export const vueEnsemble: Scenario = {
  name: 'vue-ensemble',
  timezone: 'Africa/Abidjan',
  steps: [
    post('/api/goals', { id: VG, title: 'Réussir le semestre', category: 'ETUDES', status: 'EN_COURS', startDate: '2026-09-01', endDate: '2027-01-31' }),
    post('/api/tasks', { id: uid(95), title: 'Réviser', workDate: '2026-11-04' }),
    post('/api/tasks', { id: uid(96), title: 'Exercices', workDate: '2026-11-05', goalId: VG }),
    post('/api/tasks', { id: uid(97), title: 'Lire le chapitre 3', workDate: '2026-11-05' }),
    post(`/api/tasks/${uid(97)}/complete`),
    post('/api/tasks', { id: uid(98), title: 'Annulée', workDate: '2026-11-06' }),
    post(`/api/tasks/${uid(98)}/cancel`),
    post('/api/tasks', { id: uid(99), title: 'Rendre le mémoire', workDate: '2026-11-20', goalId: VG }),
    // Cours le lundi et le mercredi jusqu'à fin novembre ; footing chaque matin jusqu'au 10.
    post('/api/events', { id: COURS, type: 'REUNION', title: 'Cours de statistiques', date: '2026-11-02', startTime: '10:00', endTime: '11:00', goalId: VG, repeat: { weekdays: [1, 3], until: '2026-11-30' } }),
    post('/api/events', { id: FOOTING, type: 'RENDEZ_VOUS', title: 'Footing', date: '2026-11-04', startTime: '07:00', endTime: '07:30', repeat: { weekdays: [1, 2, 3, 4, 5, 6, 7], until: '2026-11-10' } }),
    // Une réunion terminée en octobre.
    post('/api/events', { id: ANCIENNE, type: 'APPEL', title: 'Appel de rentrée', date: '2026-10-05', startTime: '18:00', endTime: '18:30', repeat: { weekdays: [1], until: '2026-10-26' } }),
    // Un rendez-vous qui chevauche le cours du mercredi 11, un autre en décembre.
    post('/api/events', { id: uid(100), type: 'RENDEZ_VOUS', title: 'Dentiste', date: '2026-11-11', startTime: '10:30', endTime: '11:00' }),
    post('/api/events', { id: uid(101), type: 'VISIO', title: 'Jury', date: '2026-12-02', startTime: '14:00', endTime: '15:00' }),
    get('/api/agenda?date=2026-11-09', { save: { c9: 'data.events.1.id' } }),
    del('/api/events/{{c9}}?scope=occurrence'),
    get('/api/calendar?month=2026-11'),
    get('/api/calendar'),
    get('/api/calendar?month=2026-12'),
    get('/api/series'),
    get('/api/agenda?date=2026-11-06', { save: { f6: 'data.events.0.id' } }),
    del('/api/events/{{f6}}?scope=following'),
    get('/api/series'),
    { method: 'GET', path: '/api/calendar?month=2026-13', expect: 400 },
    { method: 'GET', path: '/api/calendar?month=nov', expect: 400 },
  ],
};

// ---------------------------------------------------------------------------------------------
// 8. Habitudes (spec 012). Mercredi 4 novembre 2026, Africa/Abidjan.

const [HG, H1, H2, H3] = [uid(110), uid(111), uid(112), uid(113)];
const check = (id: string, date?: string, extra: Partial<Step> = {}) => post(`/api/habits/${id}/check`, date ? { date } : {}, extra);

export const habitudes: Scenario = {
  name: 'habitudes',
  timezone: 'Africa/Abidjan',
  steps: [
    post('/api/goals', { id: HG, title: 'Lire 12 livres', category: 'ETUDES', status: 'EN_COURS', startDate: '2026-09-01', endDate: '2027-08-31' }),
    post('/api/habits', { id: H1, title: 'Lire 20 pages', goalId: HG, kind: 'JOURS', weekdays: [1, 2, 3, 4, 5, 6, 7], startDate: '2026-10-26' }),
    post('/api/habits', { id: H2, title: 'Sport', kind: 'SEMAINE', timesPerWeek: 3, startDate: '2026-10-26' }),
    post('/api/habits', { id: H3, title: 'Réviser', kind: 'JOURS', weekdays: [5, 1, 2, 3, 4] }),
    post('/api/habits', { title: 'Sans jours', kind: 'JOURS' }, { expect: 400 }),
    post('/api/habits', { title: 'Trop souvent', kind: 'SEMAINE', timesPerWeek: 8 }, { expect: 400 }),
    post('/api/habits', { title: '', kind: 'SEMAINE', timesPerWeek: 2 }, { expect: 400 }),
    // Lecture : manquée le 26 et le 30 octobre.
    ...['2026-10-27', '2026-10-28', '2026-10-29', '2026-10-31', '2026-11-01', '2026-11-02', '2026-11-03'].map((d) => check(H1, d, { silent: true })),
    // Sport : 3 fois la première semaine, 1 fois la seconde (en cours).
    ...['2026-10-27', '2026-10-29', '2026-10-31', '2026-11-02'].map((d) => check(H2, d, { silent: true })),
    check(H1, '2026-11-05', { expect: 400 }),
    check(H1, '2026-10-20', { expect: 400 }),
    check(H1, '2026-11-03'),
    post(`/api/habits/${H1}/uncheck`, { date: '2026-11-01' }),
    post(`/api/habits/${H1}/uncheck`, { date: '2026-11-01' }),
    check(H1, '2026-11-01'),
    get('/api/today'),
    check(H1),
    get('/api/habits'),
    get(`/api/habits/${H1}`),
    get(`/api/habits/${H2}`),
    // Changement de fréquence daté : lundi, mercredi, vendredi à partir de demain ; jamais avant le début.
    patch(`/api/habits/${H1}`, { kind: 'JOURS', weekdays: [1, 3, 5], from: '2026-11-05' }),
    patch(`/api/habits/${H1}`, { kind: 'JOURS', weekdays: [1], from: '2026-10-01' }, { expect: 400 }),
    patch(`/api/habits/${H1}`, { title: 'Lire 30 pages' }),
    // Pause : l'habitude disparaît du jour ; reprise le jour même : la pause est effacée.
    post(`/api/habits/${H3}/pause`),
    get('/api/today'),
    post(`/api/habits/${H3}/resume`),
    post(`/api/habits/${H2}/archive`),
    get('/api/habits?status=ACTIVE'),
    post(`/api/habits/${H2}/unarchive`),
    get('/api/reviews?period=week&date=2026-11-04'),
    get('/api/reviews?period=week&date=2026-10-28'),
    get('/api/today?date=2026-11-02'),
    del(`/api/habits/${H3}`),
    { method: 'GET', path: `/api/habits/${H3}`, expect: 404 },
    { method: 'GET', path: '/api/habits?status=PERDUE', expect: 400 },
  ],
};

export const SCENARIOS: Scenario[] = [tachesEtBilan, progressionMesuree, evenements, budgetMensuel, ordreDesListes, reunionsRecurrentes, vueEnsemble, habitudes];
