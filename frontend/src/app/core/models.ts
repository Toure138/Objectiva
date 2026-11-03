// Types renvoyés par l'API Objectiva (voir backend/src/modules).

export interface User {
  id: string;
  email: string;
  displayName: string;
  timezone: string;
}

export type TaskStatus = 'TODO' | 'DONE' | 'CANCELLED';

export interface Task {
  id: string;
  title: string;
  notes: string | null;
  goalId: string | null;
  milestoneId: string | null;
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

export interface Progress {
  mode: 'JALONS';
  done: number;
  total: number;
  percent: number | null;
  label: string;
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
  progress: Progress;
  nextAction: Task | null;
  needsNextAction: boolean;
}

export interface GoalDetail extends Goal {
  milestones: Milestone[];
  tasks: Task[];
}

export interface TodayView {
  date: string;
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
