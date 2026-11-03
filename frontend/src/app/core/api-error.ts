import { HttpErrorResponse } from '@angular/common/http';

export interface FieldError {
  field: string;
  message: string;
}

/** Erreur normalisée pour l'interface : toujours un message en français. */
export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string,
    public readonly fields: FieldError[] = [],
  ) {
    super(message);
  }
}

export function toApiError(err: unknown): ApiError {
  if (err instanceof ApiError) return err;
  if (err instanceof HttpErrorResponse) {
    if (err.status === 0) {
      return new ApiError(
        "Impossible de joindre le serveur. Vérifie ta connexion ou l'adresse de l'API dans le profil.",
        0,
        'NETWORK_ERROR',
      );
    }
    const body = err.error as { code?: string; message?: string; details?: FieldError[] } | null;
    if (body && typeof body === 'object' && body.message) {
      return new ApiError(
        body.message,
        err.status,
        body.code ?? 'UNKNOWN',
        Array.isArray(body.details) ? body.details : [],
      );
    }
    return new ApiError('Une erreur est survenue, réessaie plus tard.', err.status, 'UNKNOWN');
  }
  return new ApiError('Une erreur inattendue est survenue.', -1, 'UNKNOWN');
}
