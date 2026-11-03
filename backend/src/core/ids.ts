import { z } from 'zod';
import { notFound } from './errors.ts';

const uuid = z.string().uuid();

// Un identifiant mal formé est traité comme introuvable : même réponse qu'un id inconnu.
export function idParam(value: unknown, what?: string): string {
  const r = uuid.safeParse(value);
  if (!r.success) throw notFound(what);
  return r.data;
}

export const optionalId = z.string().uuid('Identifiant invalide').nullable().optional();
