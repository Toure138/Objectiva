import { z } from 'zod';

/** Identifiant UUID. L'appareil peut en générer lui-même (fonctionnement hors connexion). */
export const uuid = z.string().uuid('Identifiant invalide');

export const optionalId = uuid.nullable().optional();

/** Identifiant fourni par le client à la création : facultatif, sinon le serveur en génère un. */
export const clientId = uuid.optional();
