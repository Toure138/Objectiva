import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3100),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL manquant'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET doit contenir au moins 32 caractères'),
  // Durée de vie d'une session, en jours.
  SESSION_DAYS: z.coerce.number().int().positive().default(30),
  // Origines autorisées, séparées par des virgules.
  CORS_ORIGIN: z.string().default('http://localhost:4200'),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  // Message lisible au démarrage plutôt qu'une erreur obscure plus tard.
  console.error('Configuration invalide :', parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
  process.exit(1);
}

export const env = parsed.data;
