import { z } from 'zod';
import { dateOnly } from '../../core/dates.ts';

export const goalCategory = z.enum(
  ['ETUDES', 'CARRIERE', 'SANTE', 'FINANCES', 'SPIRITUALITE', 'FAMILLE', 'PROJET_PERSONNEL'],
  { message: 'Catégorie inconnue' },
);
export const goalHorizon = z.enum(['MOIS', 'TRIMESTRE', 'ANNEE', 'PERSONNALISEE']);
export const goalPriority = z.enum(['HAUTE', 'MOYENNE', 'BASSE']);
export const goalStatus = z.enum(['A_DEMARRER', 'EN_COURS', 'EN_PAUSE', 'TERMINE', 'ABANDONNE']);

const goalFields = {
  title: z.string().trim().min(1, 'Le titre est obligatoire').max(120),
  description: z.string().trim().max(2000).nullable().optional(),
  motivation: z.string().trim().max(500).nullable().optional(),
  category: goalCategory,
  horizon: goalHorizon.optional(),
  startDate: dateOnly,
  endDate: dateOnly,
  priority: goalPriority.optional(),
  status: goalStatus.optional(),
};

export const createGoalSchema = z
  .object(goalFields)
  .refine((g) => g.endDate >= g.startDate, { message: "L'échéance doit suivre la date de début", path: ['endDate'] });

// La cohérence des dates est revérifiée dans le service avec les valeurs existantes.
export const updateGoalSchema = z.object(goalFields).partial();

export const listGoalsQuery = z.object({
  status: goalStatus.optional(),
  category: goalCategory.optional(),
});

export const createMilestoneSchema = z.object({
  title: z.string().trim().min(1, 'Le titre est obligatoire').max(120),
  dueDate: dateOnly.nullable().optional(),
});

export const updateMilestoneSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  dueDate: dateOnly.nullable().optional(),
  completed: z.boolean().optional(),
});
