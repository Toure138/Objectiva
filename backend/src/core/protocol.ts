import type { NextFunction, Request, Response } from 'express';
import { checkProtocol, MIN_SYNC_PROTOCOL_VERSION, PROTOCOL_HEADER, SYNC_PROTOCOL_VERSION } from '../../../shared/src/sync.ts';

/**
 * Garde des routes de synchronisation : le client annonce la version du protocole qu'il parle.
 * Trop ancienne ou trop récente → 426 avec un message affichable ; le client conserve alors son
 * journal local intact et invite à mettre l'application à jour.
 */
export function requireProtocol(req: Request, res: Response, next: NextFunction) {
  const result = checkProtocol(req.headers[PROTOCOL_HEADER]);
  if (result === 'ok') return next();
  const message =
    result === 'client-too-new'
      ? 'Le serveur doit être mis à jour pour synchroniser cette version de l’application'
      : result === 'client-too-old'
        ? 'Cette version de l’application est trop ancienne pour se synchroniser : mets-la à jour. Tes données restent sur ton téléphone.'
        : 'Version du protocole de synchronisation manquante ou invalide';
  res.status(426).json({
    success: false,
    code: 'UPGRADE_REQUIRED',
    message,
    details: { protocolVersion: SYNC_PROTOCOL_VERSION, minProtocolVersion: MIN_SYNC_PROTOCOL_VERSION },
  });
}
