import { z } from 'zod';

export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHENTICATED'
  | 'INVALID_CREDENTIALS'
  | 'TOO_MANY_ATTEMPTS'
  | 'EMAIL_TAKEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'UPGRADE_REQUIRED'
  | 'INTERNAL_ERROR';

/**
 * Erreur métier : même forme côté serveur (réponse HTTP) et côté téléphone (moteur local).
 * `message` est en français et peut être affiché tel quel ; `code` est stable.
 */
export class DomainError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: ErrorCode,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

// 404 volontairement identique pour « n'existe pas » et « appartient à quelqu'un d'autre » :
// on ne révèle pas l'existence des données d'un autre utilisateur.
export const notFound = (what = 'Élément') => new DomainError(404, 'NOT_FOUND', `${what} introuvable`);

export const conflict = (message: string) => new DomainError(409, 'CONFLICT', message);

export const validationError = (details: { field: string; message: string }[]) =>
  new DomainError(400, 'VALIDATION_ERROR', 'Certaines informations sont invalides', details);

/** Valide une entrée avec un schéma zod ; mêmes messages et mêmes `details` partout. */
export function parseInput<T extends z.ZodType>(schema: T, data: unknown): z.infer<T> {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw validationError(result.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })));
  }
  return result.data;
}
