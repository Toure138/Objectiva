import { z } from 'zod';
import { dateOnly } from './dates';
import { isHlc } from './hlc';
import { uuid } from './ids';

// Messages de synchronisation (spec 007) et schémas des lignes qu'ils transportent.
// Partagés : le téléphone valide ce qu'il envoie avec les mêmes schémas que le serveur.

/** Tables synchronisées dans cette version du protocole, les parents d'abord (le budget arrive en phase 3). */
export const SYNCED_ENTITIES = ['goals', 'milestones', 'goal_readings', 'event_series', 'events', 'tasks'] as const;
export type SyncedEntity = (typeof SYNCED_ENTITIES)[number];

/** Tables qu'un client d'une version donnée sait lire : une application en version 1 ne connaît pas les rendez-vous. */
export function entitiesFor(protocol: number): readonly SyncedEntity[] {
  return protocol >= 2 ? SYNCED_ENTITIES : (['goals', 'milestones', 'goal_readings', 'tasks'] as const);
}

const instant = z.iso.datetime({ message: 'Instant ISO 8601 attendu' });
const int = z.number().int();
const nullableText = (max: number) => z.string().max(max).nullable();

// --- Champs modifiables de chaque table (nom « fil », en camelCase). Strictes : un champ inconnu est refusé.

export const goalFields = z
  .object({
    title: z.string().trim().min(1).max(120),
    description: nullableText(2000),
    motivation: nullableText(500),
    category: z.enum(['ETUDES', 'CARRIERE', 'SANTE', 'FINANCES', 'SPIRITUALITE', 'FAMILLE', 'PROJET_PERSONNEL']),
    horizon: z.enum(['MOIS', 'TRIMESTRE', 'ANNEE', 'PERSONNALISEE']),
    startDate: dateOnly,
    endDate: dateOnly,
    priority: z.enum(['HAUTE', 'MOYENNE', 'BASSE']),
    status: z.enum(['A_DEMARRER', 'EN_COURS', 'EN_PAUSE', 'TERMINE', 'ABANDONNE']),
    progressMode: z.enum(['JALONS', 'MESURE']),
    measureUnit: z.string().min(1).max(30).nullable(),
    startValue: int.min(-1_000_000_000).max(1_000_000_000).nullable(),
    targetValue: int.min(-1_000_000_000).max(1_000_000_000).nullable(),
  })
  .strict();

export const milestoneFields = z
  .object({
    goalId: uuid,
    title: z.string().trim().min(1).max(120),
    dueDate: dateOnly.nullable(),
    completedAt: instant.nullable(),
  })
  .strict();

export const readingFields = z
  .object({
    goalId: uuid,
    value: int.min(-1_000_000_000).max(1_000_000_000),
    readOn: dateOnly,
    note: nullableText(200),
  })
  .strict();

export const taskFields = z
  .object({
    goalId: uuid.nullable(),
    milestoneId: uuid.nullable(),
    eventId: uuid.nullable(),
    eventRole: z.enum(['PREPARATION', 'SUIVI']).nullable(),
    title: z.string().trim().min(1).max(160),
    notes: nullableText(2000),
    workDate: dateOnly.nullable(),
    dueDate: dateOnly.nullable(),
    status: z.enum(['TODO', 'DONE', 'CANCELLED']),
    completedAt: instant.nullable(),
    originalDate: dateOnly.nullable(),
    rescheduleCount: int.min(0).max(100_000),
  })
  .strict();

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const eventType = z.enum(['REUNION', 'RENCONTRE', 'RENDEZ_VOUS', 'APPEL', 'VISIO']);
const httpLink = z
  .string()
  .max(500)
  .refine((v) => /^https?:\/\//i.test(v) && URL.canParse(v));
const participants = z.array(z.string().trim().min(1).max(80)).max(20);
const minutes = int.min(0).max(480);

export const seriesFields = z
  .object({
    goalId: uuid.nullable(),
    milestoneId: uuid.nullable(),
    type: eventType,
    title: z.string().trim().min(1).max(160),
    startTime: time,
    endTime: time,
    location: nullableText(200),
    link: httpLink.nullable(),
    participants,
    agenda: nullableText(2000),
    travelBeforeMinutes: minutes,
    prepBeforeMinutes: minutes,
    weekdays: z.array(int.min(1).max(7)).min(1).max(7),
    startDate: dateOnly,
    until: dateOnly.nullable(),
  })
  .strict();

export const eventFields = z
  .object({
    seriesId: uuid.nullable(),
    occurrenceDate: dateOnly.nullable(),
    goalId: uuid.nullable(),
    milestoneId: uuid.nullable(),
    type: eventType,
    title: z.string().trim().min(1).max(160),
    startsAt: instant,
    endsAt: instant,
    location: nullableText(200),
    link: httpLink.nullable(),
    participants,
    agenda: nullableText(2000),
    decisions: nullableText(2000),
    status: z.enum(['PREVU', 'REALISE', 'ANNULE']),
    travelBeforeMinutes: minutes,
    prepBeforeMinutes: minutes,
    completedAt: instant.nullable(),
  })
  .strict();

export const FIELD_SCHEMAS = {
  goals: goalFields,
  milestones: milestoneFields,
  goal_readings: readingFields,
  event_series: seriesFields,
  events: eventFields,
  tasks: taskFields,
} as const;

// --- Messages

const hlc = z.string().refine(isHlc, 'Horloge hybride invalide');

export const mutationSchema = z
  .object({
    mutationId: uuid,
    entity: z.enum(SYNCED_ENTITIES),
    id: uuid,
    op: z.enum(['create', 'update', 'delete']),
    /** Création : tous les champs. Modification : seulement ceux qui changent. */
    fields: z.record(z.string(), z.unknown()).optional(),
    /** Horloge hybride de chaque champ transporté. */
    clocks: z.record(z.string(), hlc).optional(),
    /** Création : instant de création (immuable ensuite). */
    createdAt: instant.optional(),
  })
  .strict();
export type Mutation = z.infer<typeof mutationSchema>;

export const MAX_MUTATIONS_PER_PUSH = 200;

export const pushSchema = z
  .object({
    deviceId: z.string().regex(/^[\w-]{1,64}$/, 'Identifiant d’appareil invalide'),
    mutations: z.array(mutationSchema).min(1).max(MAX_MUTATIONS_PER_PUSH, `${MAX_MUTATIONS_PER_PUSH} modifications au maximum par envoi`),
  })
  .strict();
export type PushRequest = z.infer<typeof pushSchema>;

export const pullQuery = z.object({
  cursor: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(500).default(200),
});

export type MutationStatus = 'applied' | 'ignored' | 'rejected';

export interface MutationResult {
  mutationId: string;
  status: MutationStatus;
  /** Code stable : `deleted`, `exists`, `parent-missing`, `invalid`, `not-found`, `conflict`… */
  reason?: string;
  /** Message affichable à l'utilisateur (modification refusée). */
  message?: string;
}

export interface PushResponse {
  epoch: string;
  results: MutationResult[];
}

export interface SyncChange {
  entity: SyncedEntity;
  op: 'upsert' | 'delete';
  id: string;
  version: number;
  /** Ligne complète (format `domain/rows`), absente pour une suppression. */
  row?: Record<string, unknown>;
  clocks?: Record<string, string>;
}

export interface PullResponse {
  epoch: string;
  /** Curseur à renvoyer au prochain appel (dernier numéro de version traité). */
  cursor: number;
  hasMore: boolean;
  changes: SyncChange[];
}
