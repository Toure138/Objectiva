import { z } from 'zod';
import { notFound } from './errors';

/** Identifiant UUID. L'appareil peut en générer lui-même (fonctionnement hors connexion). */
export const uuid = z.string().uuid('Identifiant invalide');

export const optionalId = uuid.nullable().optional();

/** Identifiant fourni par le client à la création : facultatif, sinon le serveur en génère un. */
export const clientId = uuid.optional();

// Un identifiant mal formé est traité comme introuvable : même réponse qu'un id inconnu.
export function idParam(value: unknown, what?: string): string {
  const r = uuid.safeParse(value);
  if (!r.success) throw notFound(what);
  return r.data;
}
