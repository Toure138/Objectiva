// Lignes de données synchronisables (format « fil » : dates AAAA-MM-JJ, instants ISO 8601 UTC).
// Ce sont les mêmes objets sur le serveur (convertis depuis Prisma) et sur le téléphone (IndexedDB).

export type GoalCategory = 'ETUDES' | 'CARRIERE' | 'SANTE' | 'FINANCES' | 'SPIRITUALITE' | 'FAMILLE' | 'PROJET_PERSONNEL';
export type GoalHorizon = 'MOIS' | 'TRIMESTRE' | 'ANNEE' | 'PERSONNALISEE';
export type GoalPriority = 'HAUTE' | 'MOYENNE' | 'BASSE';
export type GoalStatus = 'A_DEMARRER' | 'EN_COURS' | 'EN_PAUSE' | 'TERMINE' | 'ABANDONNE';
export type ProgressMode = 'JALONS' | 'MESURE';
export type TaskStatus = 'TODO' | 'DONE' | 'CANCELLED';
export type EventTaskRole = 'PREPARATION' | 'SUIVI';

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

/** Statuts d'objectif encore « actifs » (invitation à planifier une prochaine action, bilan…). */
export const ACTIVE_GOAL_STATUSES = ['A_DEMARRER', 'EN_COURS'] as const;
