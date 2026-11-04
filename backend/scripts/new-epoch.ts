// Renouvelle l'« époque » du serveur. À lancer après toute restauration de sauvegarde :
// les appareils voient que l'époque a changé et peuvent reconstruire le serveur (spec 007).
import 'dotenv/config';
import { rotateEpoch } from '../src/core/epoch.ts';
import { prisma } from '../src/core/prisma.ts';

rotateEpoch()
  .then((epoch) => console.log(`Nouvelle époque du serveur : ${epoch}`))
  .catch((e: unknown) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
