import { notFound } from './errors.ts';
import { uuid } from '../../../shared/src/ids.ts';

export { optionalId, clientId } from '../../../shared/src/ids.ts';

// Un identifiant mal formé est traité comme introuvable : même réponse qu'un id inconnu.
export function idParam(value: unknown, what?: string): string {
  const r = uuid.safeParse(value);
  if (!r.success) throw notFound(what);
  return r.data;
}
