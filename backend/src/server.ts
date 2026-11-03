import { createApp } from './app.ts';
import { env } from './core/env.ts';
import { prisma } from './core/prisma.ts';

const app = createApp();

// 0.0.0.0 : l'API est joignable depuis le téléphone sur le même réseau Wi-Fi.
const server = app.listen(env.PORT, '0.0.0.0', () => {
  console.log(`API Objectiva prête sur http://localhost:${env.PORT} (santé : /health)`);
});

server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Le port ${env.PORT} est déjà utilisé par une autre application. Change PORT dans backend/.env.`);
  } else {
    console.error('Démarrage impossible :', err.message);
  }
  process.exit(1);
});

async function shutdown() {
  server.close();
  await prisma.$disconnect();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
