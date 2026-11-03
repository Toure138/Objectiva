import { z } from 'zod';
import { dateOnly } from '../../core/dates.ts';
import { optionalId } from '../../core/ids.ts';

export const taskStatus = z.enum(['TODO', 'DONE', 'CANCELLED']);

export const createTaskSchema = z.object({
  title: z.string().trim().min(1, 'Le titre est obligatoire').max(160),
  notes: z.string().trim().max(2000).nullable().optional(),
  workDate: dateOnly.nullable().optional(),
  dueDate: dateOnly.nullable().optional(),
  goalId: optionalId,
  milestoneId: optionalId,
});

export const updateTaskSchema = createTaskSchema.partial();

export const rescheduleSchema = z.object({
  // null = remettre la tâche dans « À planifier ».
  workDate: dateOnly.nullable(),
});

const booleanString = z.enum(['true', 'false']).transform((v) => v === 'true');

export const listTasksQuery = z
  .object({
    status: taskStatus.optional(),
    goalId: z.string().uuid('Identifiant invalide').optional(),
    from: dateOnly.optional(),
    to: dateOnly.optional(),
    unscheduled: booleanString.optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
    offset: z.coerce.number().int().min(0).default(0),
  })
  .refine((q) => !q.from || !q.to || q.from <= q.to, { message: 'La date de début doit précéder la date de fin', path: ['to'] });
