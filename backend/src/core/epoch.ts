import { prisma } from './prisma.ts';

/** Époque courante du serveur (une seule ligne `server_meta`). */
export async function currentEpoch(): Promise<string> {
  const row = await prisma.serverMeta.findUnique({ where: { id: 1 } });
  if (!row) throw new Error('Ligne server_meta introuvable : les migrations sont-elles appliquées ?');
  return row.epoch;
}

/** Renouvelle l'époque : à faire après toute restauration de sauvegarde (voir scripts/new-epoch.ts). */
export async function rotateEpoch(): Promise<string> {
  const rows = await prisma.$queryRaw<{ epoch: string }[]>`UPDATE server_meta SET epoch = gen_random_uuid() WHERE id = 1 RETURNING epoch::text AS epoch`;
  const epoch = rows[0]?.epoch;
  if (!epoch) throw new Error('Ligne server_meta introuvable : les migrations sont-elles appliquées ?');
  return epoch;
}
