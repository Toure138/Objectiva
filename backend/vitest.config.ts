import 'dotenv/config';
import { defineConfig } from 'vitest/config';

const testDb = process.env.TEST_DATABASE_URL;
if (!testDb) {
  throw new Error('TEST_DATABASE_URL manquant dans backend/.env (voir .env.example)');
}

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    globalSetup: ['tests/global-setup.ts'],
    // Une seule base de test partagée : les fichiers s'exécutent l'un après l'autre.
    fileParallelism: false,
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: testDb,
    },
  },
});
