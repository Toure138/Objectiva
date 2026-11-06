import type { HabitPause, HabitRule } from '../habits.rules';

// Lignes de données synchronisables (format « fil » : dates AAAA-MM-JJ, instants ISO 8601 UTC).
// Ce sont les mêmes objets sur le serveur (convertis depuis Prisma) et sur le téléphone (IndexedDB).

export type GoalCategory = 'ETUDES' | 'CARRIERE' | 'SANTE' | 'FINANCES' | 'SPIRITUALITE' | 'FAMILLE' | 'PROJET_PERSONNEL';
export type GoalHorizon = 'MOIS' | 'TRIMESTRE' | 'ANNEE' | 'PERSONNALISEE';
export type GoalPriority = 'HAUTE' | 'MOYENNE' | 'BASSE';
export type GoalStatus = 'A_DEMARRER' | 'EN_COURS' | 'EN_PAUSE' | 'TERMINE' | 'ABANDONNE';
export type ProgressMode = 'JALONS' | 'MESURE';
export type TaskStatus = 'TODO' | 'DONE' | 'CANCELLED';
export type EventTaskRole = 'PREPARATION' | 'SUIVI';
export type EventType = 'REUNION' | 'RENCONTRE' | 'RENDEZ_VOUS' | 'APPEL' | 'VISIO';
export type EventStatus = 'PREVU' | 'REALISE' | 'ANNULE';
/** Moment du rappel (spec 011) ; `null` = réglage par défaut du téléphone. */
export type EventReminder = 'AUCUN' | 'HEURE' | 'M15' | 'M30' | 'H1' | 'DEPART';

export interface GoalRow {
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
  createdAt: string;
  updatedAt: string;
}

export interface MilestoneRow {
  id: string;
  goalId: string;
  title: string;
  dueDate: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ReadingRow {
  id: string;
  goalId: string;
  value: number;
  readOn: string;
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TaskRow {
  id: string;
  goalId: string | null;
  milestoneId: string | null;
  eventId: string | null;
  eventRole: EventTaskRole | null;
  title: string;
  notes: string | null;
  workDate: string | null;
  dueDate: string | null;
  status: TaskStatus;
  completedAt: string | null;
  originalDate: string | null;
  rescheduleCount: number;
  createdAt: string;
  updatedAt: string;
}

/** Rendez-vous (instants UTC) ; une occurrence de réunion récurrente porte sa série et sa date d'origine. */
export interface EventRow {
  id: string;
  seriesId: string | null;
  occurrenceDate: string | null;
  goalId: string | null;
  milestoneId: string | null;
  type: EventType;
  title: string;
  startsAt: string;
  endsAt: string;
  location: string | null;
  link: string | null;
  participants: string[];
  agenda: string | null;
  decisions: string | null;
  status: EventStatus;
  travelBeforeMinutes: number;
  prepBeforeMinutes: number;
  reminder: EventReminder | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Réunion récurrente : modèle (heures locales) et jours de la semaine (1 = lundi … 7 = dimanche). */
export interface SeriesRow {
  id: string;
  goalId: string | null;
  milestoneId: string | null;
  type: EventType;
  title: string;
  startTime: string;
  endTime: string;
  location: string | null;
  link: string | null;
  participants: string[];
  agenda: string | null;
  travelBeforeMinutes: number;
  prepBeforeMinutes: number;
  reminder: EventReminder | null;
  weekdays: number[];
  startDate: string;
  until: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Habitude (spec 012) : règles datées et pauses, évaluées par `habits.rules.ts`. */
export interface HabitRow {
  id: string;
  goalId: string | null;
  title: string;
  rules: HabitRule[];
  pauses: HabitPause[];
  status: 'ACTIVE' | 'ARCHIVEE';
  startDate: string;
  createdAt: string;
  updatedAt: string;
}

/** Un jour d'une habitude : identifiant calculé (habitude + jour), `done` remis à faux pour décocher. */
export interface HabitCheckRow {
  id: string;
  habitId: string;
  date: string;
  done: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Statuts d'objectif encore « actifs » (invitation à planifier une prochaine action, bilan…). */
export const ACTIVE_GOAL_STATUSES = ['A_DEMARRER', 'EN_COURS'] as const;
