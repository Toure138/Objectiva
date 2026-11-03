import { z } from 'zod';
import { dateOnly } from '../../core/dates.ts';

export const goalCategory = z.enum(
  ['ETUDES', 'CARRIERE', 'SANTE', 'FINANCES', 'SPIRITUALITE', 'FAMILLE', 'PROJET_PERSONNEL'],
  { message: 'Catégorie inconnue' },
);
export const goalHorizon = z.enum(['MOIS', 'TRIMESTRE', 'ANNEE', 'PERSONNALISEE']);
export const goalPriority = z.enum(['HAUTE', 'MOYENNE', 'BASSE']);
export const goalStatus = z.enum(['A_DEMARRER', 'EN_COURS', 'EN_PAUSE', 'TERMINE', 'ABANDONNE']);

export const progressMode = z.enum(['JALONS', 'MESURE']);
const measureInt = z.number({ message: 'Un nombre entier est attendu' }).int('Un nombre entier est attendu').min(-1_000_000_000).max(1_000_000_000);

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
  progressMode: progressMode.optional(),
  measureUnit: z.string().trim().min(1, "L'unité est obligatoire").max(30).nullable().optional(),
  startValue: measureInt.nullable().optional(),
  targetValue: measureInt.nullable().optional(),
};

/** En mode mesuré : unité, départ et cible obligatoires, cible différente du départ. */
export function measureProblems(g: {
  progressMode?: 'JALONS' | 'MESURE';
  measureUnit?: string | null;
  startValue?: number | null;
  targetValue?: number | null;
}): { field: string; message: string }[] {
  if (g.progressMode !== 'MESURE') return [];
  const problems: { field: string; message: string }[] = [];
  if (!g.measureUnit) problems.push({ field: 'measureUnit', message: "L'unité est obligatoire" });
  if (g.startValue === null || g.startValue === undefined) problems.push({ field: 'startValue', message: 'La valeur de départ est obligatoire' });
  if (g.targetValue === null || g.targetValue === undefined) problems.push({ field: 'targetValue', message: 'La cible est obligatoire' });
  if (problems.length === 0 && g.startValue === g.targetValue) {
    problems.push({ field: 'targetValue', message: 'La cible doit différer de la valeur de départ' });
  }
  return problems;
}

export const createGoalSchema = z
  .object(goalFields)
  .refine((g) => g.endDate >= g.startDate, { message: "L'échéance doit suivre la date de début", path: ['endDate'] })
  .superRefine((g, ctx) => {
    for (const p of measureProblems(g)) ctx.addIssue({ code: 'custom', message: p.message, path: [p.field] });
  });

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

export const createReadingSchema = z.object({
  value: measureInt,
  // Par défaut : aujourd'hui (dans le fuseau de l'utilisateur, calculé par la route).
  readOn: dateOnly.optional(),
  note: z.string().trim().max(200).nullable().optional(),
});
