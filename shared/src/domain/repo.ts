import type { GoalRow, GoalStatus, MilestoneRow, ReadingRow, TaskRow, TaskStatus } from './rows';

// Interface de stockage de la logique métier partagée. Une instance est toujours limitée à UN
// utilisateur : le serveur l'implémente avec Prisma (filtre `userId`), le téléphone avec IndexedDB.
// Les méthodes de lecture renvoient des lignes triées comme indiqué : c'est le contrat que les deux
// implémentations doivent respecter (vérifié par les tests de parité).

export interface TaskQuery {
  status?: TaskStatus;
  goalId?: string;
  from?: string;
  to?: string;
  unscheduled?: boolean;
  limit: number;
  offset: number;
}

export interface GoalQuery {
  status?: GoalStatus;
  category?: GoalRow['category'];
  /** Restreint aux statuts donnés (objectifs actifs). */
  statusIn?: readonly GoalStatus[];
}

export interface TaskRepo {
  get(id: string): Promise<TaskRow | null>;
  /** Tri : date de travail croissante (sans date en dernier), puis date de création, puis id. */
  list(q: TaskQuery): Promise<{ items: TaskRow[]; total: number }>;
  /** Toutes les tâches liées à ces objectifs (ordre libre). */
  listByGoals(goalIds: string[]): Promise<TaskRow[]>;
  /** À faire ce jour, par date de création. */
  planned(date: string): Promise<TaskRow[]>;
  /** Faites ce jour, par date de réalisation. */
  done(date: string): Promise<TaskRow[]>;
  /** À faire, date de travail avant `date`, la plus ancienne d'abord. */
  toReschedule(date: string): Promise<TaskRow[]>;
  /** À faire, échéance avant `date`, sans date de travail ou prévue plus tard ; échéance croissante. */
  overdue(date: string): Promise<TaskRow[]>;
  /** Tâches dont la date de travail ou la date initiale est dans la plage (pour le bilan). */
  inRange(from: string, to: string): Promise<TaskRow[]>;
  /** Insère une ligne ; un identifiant déjà utilisé lève une `DomainError` 409. */
  insert(row: TaskRow): Promise<void>;
  update(id: string, patch: Partial<TaskRow>): Promise<TaskRow>;
  remove(id: string): Promise<void>;
}

export interface GoalRepo {
  get(id: string): Promise<GoalRow | null>;
  /** Tri : échéance croissante, puis date de création, puis id. */
  list(q: GoalQuery): Promise<GoalRow[]>;
  /** Objectifs actifs sans aucune tâche à faire, échéance croissante : `{ id, title }`. */
  withoutNextAction(): Promise<{ id: string; title: string }[]>;
  insert(row: GoalRow): Promise<void>;
  update(id: string, patch: Partial<GoalRow>): Promise<GoalRow>;
  /** Supprime l'objectif ET, comme le fait la base, ses jalons et relevés ; détache ses tâches. */
  remove(id: string): Promise<void>;
}

export interface MilestoneRepo {
  get(id: string): Promise<MilestoneRow | null>;
  /** Tri : échéance croissante (sans échéance en dernier), puis date de création, puis id. */
  listByGoals(goalIds: string[]): Promise<MilestoneRow[]>;
  insert(row: MilestoneRow): Promise<void>;
  update(id: string, patch: Partial<MilestoneRow>): Promise<MilestoneRow>;
  /** Supprime le jalon et détache les tâches qui y étaient liées. */
  remove(id: string): Promise<void>;
}

export interface ReadingRepo {
  get(id: string): Promise<ReadingRow | null>;
  /** Les 50 plus récents de chaque objectif : date du relevé décroissante, puis création décroissante, puis id. */
  listByGoals(goalIds: string[]): Promise<ReadingRow[]>;
  insert(row: ReadingRow): Promise<void>;
  remove(id: string): Promise<void>;
}

export interface Repo {
  tasks: TaskRepo;
  goals: GoalRepo;
  milestones: MilestoneRepo;
  readings: ReadingRepo;
}

/** Contexte d'une commande : l'instant et le jour courants, fournis par l'appelant (horloge du serveur ou du téléphone). */
export interface Ctx {
  /** Instant courant, ISO 8601 UTC. */
  now: string;
  /** Jour courant dans le fuseau de l'utilisateur, AAAA-MM-JJ. */
  today: string;
  /** Fuseau de l'utilisateur. */
  timezone: string;
}

export const newId = (): string => globalThis.crypto.randomUUID();
