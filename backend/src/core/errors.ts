import type { NextFunction, Request, Response } from 'express';
import { DomainError } from '../../../shared/src/errors.ts';

// L'erreur métier et la validation des entrées sont partagées avec le téléphone (shared/src/errors.ts).
export { DomainError as AppError, notFound, parseInput } from '../../../shared/src/errors.ts';
export type { ErrorCode } from '../../../shared/src/errors.ts';

export function notFoundRoute(_req: Request, res: Response) {
  res.status(404).json({ success: false, code: 'NOT_FOUND', message: 'Route introuvable' });
}

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof DomainError) {
    res.status(err.status).json({ success: false, code: err.code, message: err.message, details: err.details });
    return;
  }
  // Collision d'unicité non gérée par un service (ex. identifiant fourni par un appareil déjà utilisé) :
  // même réponse que l'identifiant appartienne à soi ou à un autre utilisateur, sans rien révéler.
  if (typeof err === 'object' && err !== null && 'code' in err && (err as { code: unknown }).code === 'P2002') {
    res.status(409).json({ success: false, code: 'CONFLICT', message: 'Cette donnée existe déjà (identifiant déjà utilisé)' });
    return;
  }
  if (err instanceof SyntaxError && 'body' in err) {
    res.status(400).json({ success: false, code: 'VALIDATION_ERROR', message: 'Corps de requête JSON invalide' });
    return;
  }
  // Uniquement le message et la route : jamais le corps (mots de passe, montants).
  console.error(`[erreur] ${req.method} ${req.path}:`, err instanceof Error ? err.message : err);
  res.status(500).json({ success: false, code: 'INTERNAL_ERROR', message: 'Une erreur est survenue, réessaie plus tard' });
}
