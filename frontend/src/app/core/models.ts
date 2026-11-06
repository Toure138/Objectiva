// Types renvoyés par l'API Objectiva (voir backend/src/modules).

export interface User {
  id: string;
  email: string;
  displayName: string;
  timezone: string;
  /** Devise ISO 4217 ; les montants de l'API sont des entiers dans sa plus petite unité. */
  currency: string;
}

export type TaskStatus = 'TODO' | 'DONE' | 'CANCELLED';
export type EventTaskRole = 'PREPARATION' | 'SUIVI';

export interface Task {
  id: string;
  title: string;
  notes: string | null;
  goalId: string | null;
  milestoneId: string | null;
  eventId: string | null;
  eventRole: EventTaskRole | null;
  workDate: string | null;
  dueDate: string | null;
  originalDate: string | null;
  rescheduleCount: number;
  status: TaskStatus;
  completedAt: string | null;
  needsRescheduling: boolean;
  overdue: boolean;
  unscheduled: boolean;
  suggestSplit: boolean;
}

export type GoalCategory =
  'ETUDES' | 'CARRIERE' | 'SANTE' | 'FINANCES' | 'SPIRITUALITE' | 'FAMILLE' | 'PROJET_PERSONNEL';
export type GoalStatus = 'A_DEMARRER' | 'EN_COURS' | 'EN_PAUSE' | 'TERMINE' | 'ABANDONNE';
export type GoalPriority = 'HAUTE' | 'MOYENNE' | 'BASSE';
export type GoalHorizon = 'MOIS' | 'TRIMESTRE' | 'ANNEE' | 'PERSONNALISEE';

export type ProgressMode = 'JALONS' | 'MESURE';

/** Progression calculée par le serveur : le frontend l'affiche sans la recalculer. */
export interface Progress {
  mode: ProgressMode;
  percent: number | null;
  label: string;
  // Mode JALONS
  done?: number;
  total?: number;
  // Mode MESURE
  current?: number;
  start?: number;
  target?: number;
  unit?: string;
  reached?: boolean;
}

export interface GoalReading {
  id: string;
  goalId: string;
  value: number;
  readOn: string;
  note: string | null;
  createdAt: string;
}

export interface Milestone {
  id: string;
  goalId: string;
  title: string;
  dueDate: string | null;
  completed: boolean;
}

export interface Goal {
  id: string;
  title: string;
  description: string | null;
  motivation: string | null;
  category: GoalCategory;
  horizon: GoalHorizon;
  startDate: string;
  endDate: string;
  priority: GoalPriority;
  status: GoalStatus;
  progressMode: ProgressMode;
  measureUnit: string | null;
  startValue: number | null;
  targetValue: number | null;
  progress: Progress;
  nextAction: Task | null;
  needsNextAction: boolean;
}

export interface GoalDetail extends Goal {
  milestones: Milestone[];
  readings: GoalReading[];
  tasks: Task[];
}

export type EventType = 'REUNION' | 'RENCONTRE' | 'RENDEZ_VOUS' | 'APPEL' | 'VISIO';
export type EventStatus = 'PREVU' | 'REALISE' | 'ANNULE';

/** Réunion, rencontre, rendez-vous, appel ou visio (nommé ainsi pour ne pas masquer `Event` du DOM). */
export interface CalendarEvent {
  id: string;
  type: EventType;
  title: string;
  /** Jour et heures dans le fuseau de l'utilisateur (déjà convertis par le serveur). */
  date: string;
  startTime: string;
  endTime: string;
  /** Instants UTC (ISO 8601). */
  startsAt: string;
  endsAt: string;
  location: string | null;
  link: string | null;
  participants: string[];
  agenda: string | null;
  decisions: string | null;
  status: EventStatus;
  goalId: string | null;
  milestoneId: string | null;
  travelBeforeMinutes: number;
  prepBeforeMinutes: number;
  blockedMinutes: number;
  blockedFromTime: string;
  leaveAtTime: string | null;
  completedAt: string | null;
  /** Rappel (spec 011) ; `null` = réglage par défaut du téléphone. */
  reminder: EventReminder | null;
  /** Occurrence d'une réunion récurrente : série, date d'origine et règle de répétition. */
  seriesId: string | null;
  occurrenceDate: string | null;
  repeat: EventRepeat | null;
}

/** Jours de la semaine ISO : 1 = lundi … 7 = dimanche. */
export interface EventRepeat {
  weekdays: number[];
  startDate: string;
  until: string | null;
}

export type EventScope = 'occurrence' | 'following' | 'series';

export type EventReminder = 'AUCUN' | 'HEURE' | 'M15' | 'M30' | 'H1' | 'DEPART';

export const REMINDER_LABELS: Record<EventReminder, string> = {
  DEPART: 'Quand partir ou se préparer',
  HEURE: 'À l’heure du rendez-vous',
  M15: '15 min avant',
  M30: '30 min avant',
  H1: '1 h avant',
  AUCUN: 'Aucun rappel',
};

export type ConflictKind = 'CHEVAUCHEMENT' | 'PREPARATION';

export interface AgendaEvent extends CalendarEvent {
  /** Colonne et nombre de colonnes du groupe : les rendez-vous qui se gênent sont côte à côte. */
  column: number;
  columns: number;
  conflicts: { withId: string; withTitle: string; kind: ConflictKind }[];
}

export interface AgendaDay {
  date: string;
  startHour: number;
  endHour: number;
  events: AgendaEvent[];
  conflictCount: number;
}

/** Un jour du calendrier du mois (spec 010). */
export interface CalendarDay {
  date: string;
  /** Rendez-vous non annulés. */
  events: number;
  /** Tâches à faire ce jour. */
  tasks: number;
  /** Tâches faites ce jour. */
  done: number;
  /** Au moins un chevauchement (horaires ou trajet / préparation). */
  conflict: boolean;
}

export interface CalendarMonth {
  month: string;
  days: CalendarDay[];
}

/** Réunion récurrente, avec sa prochaine occurrence non annulée. */
export interface SeriesSummary {
  id: string;
  type: EventType;
  title: string;
  startTime: string;
  endTime: string;
  location: string | null;
  goalId: string | null;
  weekdays: number[];
  startDate: string;
  until: string | null;
  nextOccurrence: { id: string; date: string } | null;
  ended: boolean;
}

export interface CalendarEventDetail extends CalendarEvent {
  tasks: Task[];
}

export interface EventSummary {
  planned: number;
  done: number;
  cancelled: number;
  expected: number;
}

export type HabitKind = 'JOURS' | 'SEMAINE';
export type HabitDayState = 'FAIT' | 'MANQUE' | 'A_FAIRE' | 'PAUSE' | 'LIBRE' | 'AVANT' | 'FUTUR';

export interface HabitStreak {
  value: number;
  unit: 'JOURS' | 'SEMAINES';
}

/** Habitude (spec 012) : règle en vigueur, séries et réussite calculées par l'API ou le moteur local. */
export interface Habit {
  id: string;
  title: string;
  goalId: string | null;
  status: 'ACTIVE' | 'ARCHIVEE';
  startDate: string;
  kind: HabitKind;
  weekdays: number[];
  timesPerWeek: number | null;
  rules: { from: string; kind: HabitKind; weekdays: number[]; timesPerWeek: number | null }[];
  pauses: { from: string; to: string | null }[];
  paused: boolean;
  doneToday: boolean;
  streak: HabitStreak;
  bestStreak: number;
  week: { done: number; target: number } | null;
  last30: { expected: number; done: number; rate: number | null };
}

export interface HabitDetail extends Habit {
  grid: { date: string; state: HabitDayState }[];
}

/** Habitude du jour (« Aujourd'hui »). */
export interface TodayHabit {
  id: string;
  title: string;
  goalId: string | null;
  kind: HabitKind;
  done: boolean;
  streak: HabitStreak;
  week: { done: number; target: number } | null;
}

export interface TodayView {
  date: string;
  events: CalendarEvent[];
  habits: TodayHabit[];
  planned: Task[];
  done: Task[];
  toReschedule: Task[];
  overdue: Task[];
  goalsWithoutNextAction: { id: string; title: string }[];
  emptyMessage: string | null;
}

export interface Rate {
  numerator: number;
  denominator: number;
  percent: number;
}

export interface Review {
  from: string;
  to: string;
  tasks: {
    expected: number;
    done: number;
    pending: number;
    rescheduledOut: number;
    cancelled: number;
    plannedAtStart: number;
    addedDuringPeriod: number;
    executionRate: Rate | null;
  };
  events: EventSummary;
  habits: { id: string; title: string; expected: number; done: number; rate: number | null }[];
  goals: { id: string; title: string; progress: Progress; milestonesDoneInPeriod: number }[];
  questions: string[];
}

export interface Page<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

export const CATEGORY_LABELS: Record<GoalCategory, string> = {
  ETUDES: 'Études',
  CARRIERE: 'Carrière',
  SANTE: 'Santé',
  FINANCES: 'Finances',
  SPIRITUALITE: 'Spiritualité',
  FAMILLE: 'Famille',
  PROJET_PERSONNEL: 'Projet personnel',
};

export const GOAL_STATUS_LABELS: Record<GoalStatus, string> = {
  A_DEMARRER: 'À démarrer',
  EN_COURS: 'En cours',
  EN_PAUSE: 'En pause',
  TERMINE: 'Terminé',
  ABANDONNE: 'Abandonné',
};

export const PRIORITY_LABELS: Record<GoalPriority, string> = {
  HAUTE: 'Haute',
  MOYENNE: 'Moyenne',
  BASSE: 'Basse',
};

export const HORIZON_LABELS: Record<GoalHorizon, string> = {
  MOIS: 'Mois',
  TRIMESTRE: 'Trimestre',
  ANNEE: 'Année',
  PERSONNALISEE: 'Période personnalisée',
};

export const EVENT_TYPE_LABELS: Record<EventType, string> = {
  REUNION: 'Réunion',
  RENCONTRE: 'Rencontre',
  RENDEZ_VOUS: 'Rendez-vous',
  APPEL: 'Appel',
  VISIO: 'Visio',
};

export const EVENT_STATUS_LABELS: Record<EventStatus, string> = {
  PREVU: 'Prévu',
  REALISE: 'Réalisé',
  ANNULE: 'Annulé',
};

// --- Budget (spec 005). Tous les montants sont des entiers dans la plus petite unité de la devise.

export type MoneyType = 'REVENU' | 'DEPENSE' | 'EPARGNE';
export type AccountKind = 'ESPECES' | 'BANQUE' | 'MOBILE_MONEY';
export type OperationStatus = 'PREVUE' | 'PARTIELLE' | 'SOLDEE' | 'ANNULEE';

export interface BudgetAccount {
  id: string;
  name: string;
  kind: AccountKind;
  openingBalance: number;
  balance: number;
  archived: boolean;
}

export interface BudgetCategory {
  id: string;
  name: string;
  type: MoneyType;
  archived: boolean;
}

export interface BudgetOperation {
  id: string;
  type: MoneyType;
  label: string;
  plannedAmount: number;
  dueDate: string;
  categoryId: string | null;
  accountId: string | null;
  status: OperationStatus;
  paid: number;
  remaining: number;
  economy: number;
  overrun: number;
  closedAt: string | null;
}

export interface BudgetTransaction {
  id: string;
  type: MoneyType;
  amount: number;
  date: string;
  accountId: string;
  categoryId: string | null;
  plannedOperationId: string | null;
  label: string | null;
  createdAt: string;
}

export interface BudgetEnvelope {
  categoryId: string;
  categoryName: string;
  type: MoneyType;
  planned: number;
  spent: number;
  remaining: number;
  percent: number | null;
  overspent: boolean;
}

export interface BudgetSummary {
  plannedIncome: number;
  plannedExpense: number;
  plannedSaving: number;
  realIncome: number;
  realExpense: number;
  realSaving: number;
  remainingToSpend: number;
  overspent: boolean;
  expensePercent: number | null;
  economy: number;
  plannedNet: number;
  realNet: number;
}

export interface BudgetMonth {
  month: string;
  currency: string;
  needsSetup: boolean;
  summary: BudgetSummary;
  accounts: BudgetAccount[];
  totalBalance: number;
  categories: BudgetCategory[];
  envelopes: BudgetEnvelope[];
  operations: BudgetOperation[];
  transactions: BudgetTransaction[];
}

export const MONEY_TYPE_LABELS: Record<MoneyType, string> = {
  DEPENSE: 'Dépense',
  REVENU: 'Revenu',
  EPARGNE: 'Épargne',
};

export const ACCOUNT_KIND_LABELS: Record<AccountKind, string> = {
  ESPECES: 'Espèces',
  BANQUE: 'Banque',
  MOBILE_MONEY: 'Mobile money',
};

export const OPERATION_STATUS_LABELS: Record<OperationStatus, string> = {
  PREVUE: 'Prévue',
  PARTIELLE: 'Partielle',
  SOLDEE: 'Soldée',
  ANNULEE: 'Annulée',
};
