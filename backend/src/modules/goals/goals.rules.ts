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

export const ACTIVE_GOAL_STATUSES = ['A_DEMARRER', 'EN_COURS'] as const;
