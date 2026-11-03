import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';

export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHENTICATED'
  | 'INVALID_CREDENTIALS'
  | 'TOO_MANY_ATTEMPTS'
  | 'EMAIL_TAKEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'INTERNAL_ERROR';

export class AppError extends Error {
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
export const notFound = (what = 'Élément') => new AppError(404, 'NOT_FOUND', `${what} introuvable`);

export function parseInput<T extends z.ZodType>(schema: T, data: unknown): z.infer<T> {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      'Certaines informations sont invalides',
      result.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
    );
  }
  return result.data;
}

export function notFoundRoute(_req: Request, res: Response) {
  res.status(404).json({ success: false, code: 'NOT_FOUND', message: 'Route introuvable' });
}

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    res.status(err.status).json({ success: false, code: err.code, message: err.message, details: err.details });
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
