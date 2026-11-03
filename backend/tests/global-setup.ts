import { execSync } from 'node:child_process';

// Applique les migrations sur la base de test avant toute suite.
export default function setup() {
  execSync('npx prisma migrate deploy', {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: process.env.TEST_DATABASE_URL },
  });
}
