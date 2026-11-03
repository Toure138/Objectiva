// Règles de calcul des objectifs. Fonctions pures : testées sans base de données.

export interface MilestoneProgress {
  mode: 'JALONS';
  done: number;
  total: number;
  /** Pourcentage 0-100, ou null si aucun jalon (progression indéterminée). */
  percent: number | null;
  label: string;
}

export function milestoneProgress(milestones: { completedAt: Date | null }[]): MilestoneProgress {
  const total = milestones.length;
  const done = milestones.filter((m) => m.completedAt !== null).length;
  if (total === 0) {
    return { mode: 'JALONS', done: 0, total: 0, percent: null, label: 'Ajoute un premier jalon' };
  }
  return {
    mode: 'JALONS',
    done,
    total,
    percent: Math.round((done / total) * 100),
    label: `${done} jalon${done > 1 ? 's' : ''} terminé${done > 1 ? 's' : ''} sur ${total}`,
  };
}

export interface MeasuredProgress {
  mode: 'MESURE';
  current: number;
  start: number;
  target: number;
  unit: string;
  /** Pourcentage 0-100, borné ; fonctionne aussi pour une cible inférieure au départ (80 → 72 kg). */
  percent: number;
  reached: boolean;
  label: string;
}

export interface Reading {
  value: number;
  /** AAAA-MM-JJ */
  readOn: string;
  createdAt: Date;
}

/** Valeur courante : dernier relevé (date, puis ordre de création) ; à défaut la valeur de départ. */
export function currentValue(start: number, readings: Reading[]): number {
  const latest = [...readings].sort((a, b) =>
    a.readOn === b.readOn ? b.createdAt.getTime() - a.createdAt.getTime() : a.readOn < b.readOn ? 1 : -1,
  )[0];
  return latest ? latest.value : start;
}

export function measuredProgress(input: { start: number; target: number; unit: string; readings: Reading[] }): MeasuredProgress {
  const { start, target, unit } = input;
  const current = currentValue(start, input.readings);
  const ratio = (current - start) / (target - start);
  const percent = Math.min(100, Math.max(0, Math.round(ratio * 100)));
  const reached = target > start ? current >= target : current <= target;
  return { mode: 'MESURE', current, start, target, unit, percent, reached, label: `${current} sur ${target} ${unit}` };
}

export type GoalProgress = MilestoneProgress | MeasuredProgress;

export interface ProgressInput {
  progressMode: 'JALONS' | 'MESURE';
  measureUnit: string | null;
  startValue: number | null;
  targetValue: number | null;
  milestones: { completedAt: Date | null }[];
  readings: { value: number; readOn: Date; createdAt: Date }[];
}

/** Calcule la progression d'un objectif selon son mode (une seule source de vérité). */
export function goalProgress(g: ProgressInput): GoalProgress {
  if (g.progressMode === 'MESURE' && g.measureUnit && g.startValue !== null && g.targetValue !== null) {
    return measuredProgress({
      start: g.startValue,
      target: g.targetValue,
      unit: g.measureUnit,
      readings: g.readings.map((r) => ({ value: r.value, readOn: r.readOn.toISOString().slice(0, 10), createdAt: r.createdAt })),
    });
  }
  return milestoneProgress(g.milestones);
}

export const ACTIVE_GOAL_STATUSES = ['A_DEMARRER', 'EN_COURS'] as const;
