// Règles des tâches. Fonctions pures, dates au format AAAA-MM-JJ.

export const SPLIT_SUGGESTION_THRESHOLD = 3;

export interface TaskFlags {
  /** Date de travail passée et tâche encore ouverte. */
  needsRescheduling: boolean;
  /** Échéance dépassée et tâche encore ouverte. */
  overdue: boolean;
  /** Aucune date de travail : rangée dans « À planifier ». */
  unscheduled: boolean;
  /** Reportée plusieurs fois : proposer de la découper. */
  suggestSplit: boolean;
}

export function taskFlags(
  t: { status: string; workDate: string | null; dueDate: string | null; rescheduleCount: number },
  today: string,
): TaskFlags {
  const open = t.status === 'TODO';
  return {
    needsRescheduling: open && t.workDate !== null && t.workDate < today,
    overdue: open && t.dueDate !== null && t.dueDate < today,
    unscheduled: open && t.workDate === null,
    suggestSplit: open && t.rescheduleCount >= SPLIT_SUGGESTION_THRESHOLD,
  };
}

/**
 * Calcule l'effet d'un changement de date de travail.
 * - Première planification (pas de date avant) : ce n'est pas un report.
 * - Même date qu'avant : rien ne change (protège contre le double appui).
 * - Sinon : report, la première date prévue est conservée dans originalDate.
 */
export function applyWorkDateChange(
  current: { workDate: string | null; originalDate: string | null; rescheduleCount: number },
  next: string | null,
): { workDate: string | null; originalDate: string | null; rescheduleCount: number; changed: boolean } {
  if (next === current.workDate) {
    return { ...current, changed: false };
  }
  if (current.workDate === null) {
    return {
      workDate: next,
      originalDate: current.originalDate ?? next,
      rescheduleCount: current.rescheduleCount,
      changed: true,
    };
  }
  return {
    workDate: next,
    originalDate: current.originalDate ?? current.workDate,
    rescheduleCount: current.rescheduleCount + 1,
    changed: true,
  };
}
