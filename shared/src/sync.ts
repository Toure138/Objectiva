// Constantes et règles de compatibilité du protocole de synchronisation (spec 007).
// Partagées : l'application et le serveur doivent s'accorder sur les mêmes valeurs.

/**
 * Version du protocole parlée par ce code. À incrémenter à toute évolution incompatible.
 * 2 (spec 009) : rendez-vous et réunions récurrentes synchronisés.
 */
export const SYNC_PROTOCOL_VERSION = 2;

/**
 * Plus ancienne version encore acceptée par le serveur. Règle de la spec : au moins 12 mois de
 * compatibilité arrière, pour qu'un téléphone resté hors ligne puisse encore se synchroniser.
 */
export const MIN_SYNC_PROTOCOL_VERSION = 1;

/** En-tête HTTP portant la version du protocole du client. */
export const PROTOCOL_HEADER = 'x-objectiva-protocol';

/** Lit la version annoncée (en-tête déjà validé par `checkProtocol`). */
export function protocolOf(raw: unknown): number {
  const text = Array.isArray(raw) ? raw[0] : raw;
  return typeof text === 'string' && /^\d{1,4}$/.test(text.trim()) ? Number(text) : SYNC_PROTOCOL_VERSION;
}

export type ProtocolCheck = 'ok' | 'client-too-old' | 'client-too-new' | 'invalid';

/** Compare la version annoncée par un client à celles que ce serveur sait traiter. */
export function checkProtocol(raw: unknown, current = SYNC_PROTOCOL_VERSION, min = MIN_SYNC_PROTOCOL_VERSION): ProtocolCheck {
  const text = Array.isArray(raw) ? raw[0] : raw;
  if (typeof text !== 'string' || !/^\d{1,4}$/.test(text.trim())) return 'invalid';
  const version = Number(text);
  if (version < min) return 'client-too-old';
  if (version > current) return 'client-too-new';
  return 'ok';
}

/** Tables synchronisées, dans l'ordre où elles doivent être appliquées (les parents d'abord). */
export const SYNC_ENTITIES = [
  'goals',
  'milestones',
  'goal_readings',
  'event_series',
  'events',
  'tasks',
  'accounts',
  'budget_categories',
  'envelopes',
  'planned_operations',
  'transactions',
] as const;

export type SyncEntity = (typeof SYNC_ENTITIES)[number];
