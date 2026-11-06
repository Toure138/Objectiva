import { z } from 'zod';

import { dateOnly } from './dates';
import { weekdays } from './events.schemas';
import { clientId, optionalId } from './ids';

// Entrées des routes d'habitudes (spec 012).

const title = z.string().trim().min(1, 'Le titre est obligatoire').max(120, '120 caractères maximum');
const kind = z.enum(['JOURS', 'SEMAINE'], { message: 'Fréquence inconnue' });
const timesPerWeek = z
  .number({ message: 'Un nombre de fois est attendu' })
  .int()
  .min(1, 'Au moins 1 fois par semaine')
  .max(7, '7 fois par semaine au maximum');

/** Jours fixes : au moins un jour ; « par semaine » : de 1 à 7 fois. */
const frequencyComplete = (f: { kind?: 'JOURS' | 'SEMAINE'; weekdays?: number[]; timesPerWeek?: number }) =>
  f.kind === undefined || (f.kind === 'JOURS' ? (f.weekdays?.length ?? 0) > 0 : f.timesPerWeek !== undefined);
const frequencyMessage = {
  message: 'Choisis les jours (jours fixes) ou le nombre de fois par semaine',
  path: ['kind'],
};

export const createHabitSchema = z
  .object({
    id: clientId,
    title,
    goalId: optionalId,
    kind,
    weekdays: weekdays.optional(),
    timesPerWeek: timesPerWeek.optional(),
    startDate: dateOnly.optional(),
  })
  .refine(frequencyComplete, frequencyMessage);

/** Changer `kind`, `weekdays` ou `timesPerWeek` crée une nouvelle règle à partir de `from` (aujourd'hui par défaut). */
export const updateHabitSchema = z
  .object({
    title: title.optional(),
    goalId: optionalId,
    kind: kind.optional(),
    weekdays: weekdays.optional(),
    timesPerWeek: timesPerWeek.optional(),
    from: dateOnly.optional(),
  })
  .refine(frequencyComplete, frequencyMessage);

export const habitDayBody = z.object({ date: dateOnly.optional() });

export const listHabitsQuery = z.object({
  status: z.enum(['ACTIVE', 'ARCHIVEE'], { message: 'Statut inconnu' }).optional(),
});
