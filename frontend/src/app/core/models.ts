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

export interface TodayView {
  date: string;
  events: CalendarEvent[];
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
