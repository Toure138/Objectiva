import { HttpErrorResponse } from '@angular/common/http';

import { ApiError, toApiError } from './api-error';

describe('toApiError', () => {
  it('reprend le message, le code et les champs renvoyés par l’API', () => {
    const err = toApiError(
      new HttpErrorResponse({
        status: 400,
        error: {
          success: false,
          code: 'VALIDATION_ERROR',
          message: 'Certaines informations sont invalides',
          details: [{ field: 'endDate', message: "L'échéance doit suivre la date de début" }],
        },
      }),
    );
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(400);
    expect(err.code).toBe('VALIDATION_ERROR');
    expect(err.fields[0]?.field).toBe('endDate');
  });

  it('explique clairement une absence de réseau', () => {
    const err = toApiError(new HttpErrorResponse({ status: 0 }));
    expect(err.code).toBe('NETWORK_ERROR');
    expect(err.message).toContain('Impossible de joindre le serveur');
  });

  it('donne un message générique en français pour une réponse inattendue', () => {
    expect(toApiError(new HttpErrorResponse({ status: 502, error: 'Bad Gateway' })).message).toBe(
      'Une erreur est survenue, réessaie plus tard.',
    );
  });
});
