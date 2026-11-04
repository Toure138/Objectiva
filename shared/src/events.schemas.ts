import { z } from 'zod';
import { dateOnly } from './dates';
import { clientId, optionalId } from './ids';
import { TIME_RE } from './events.rules';

export const eventType = z.enum(['REUNION', 'RENCONTRE', 'RENDEZ_VOUS', 'APPEL', 'VISIO'], {
  message: "Type d'événement inconnu",
});
export const eventStatus = z.enum(['PREVU', 'REALISE', 'ANNULE']);

const time = z.string().regex(TIME_RE, 'Format attendu : HH:mm');
const minutes = z.number({ message: 'Un nombre de minutes est attendu' }).int('Un nombre entier est attendu').min(0).max(480, '8 heures au maximum');

// Seuls http et https : un lien « javascript: » ou « data: » ne doit jamais être stocké ni affiché comme lien.
const link = z
  .string()
  .trim()
  .max(500)
  .refine((v) => /^https?:\/\//i.test(v) && URL.canParse(v), 'Le lien doit commencer par http:// ou https://');

const eventFields = {
  type: eventType,
  title: z.string().trim().min(1, 'Le titre est obligatoire').max(160),
  date: dateOnly,
  startTime: time,
  endTime: time,
  location: z.string().trim().max(200).nullable().optional(),
  link: link.nullable().optional(),
  // Noms seulement : aucune invitation n'est envoyée.
  participants: z.array(z.string().trim().min(1, 'Un nom est vide').max(80)).max(20, '20 participants au maximum').optional(),
  agenda: z.string().trim().max(2000).nullable().optional(),
  goalId: optionalId,
  milestoneId: optionalId,
  travelBeforeMinutes: minutes.optional(),
  prepBeforeMinutes: minutes.optional(),
};

export const createEventSchema = z
  .object({ id: clientId, ...eventFields })
  .refine((e) => e.endTime > e.startTime, { message: "L'heure de fin doit suivre l'heure de début", path: ['endTime'] });

// La cohérence des heures est revérifiée dans le service avec les valeurs existantes.
export const updateEventSchema = z.object(eventFields).partial();

export const listEventsQuery = z
  .object({
    from: dateOnly.optional(),
    to: dateOnly.optional(),
    status: eventStatus.optional(),
    limit: z.coerce.number().int().min(1).max(200).default(100),
  })
  .refine((q) => !q.from || !q.to || q.from <= q.to, { message: 'La date de début doit précéder la date de fin', path: ['to'] });

export const completeEventSchema = z.object({
  decisions: z.string().trim().max(2000).nullable().optional(),
});

export const createEventTaskSchema = z.object({
  role: z.enum(['PREPARATION', 'SUIVI'], { message: 'Rôle inconnu' }),
  title: z.string().trim().min(1, 'Le titre est obligatoire').max(160).optional(),
  workDate: dateOnly.nullable().optional(),
});
