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
  // Nombre de relais (proxy) de confiance devant l'API : 0 en local, 1 derrière Render. Sans cela, toutes
  // les requêtes semblent venir du relais et la limitation par adresse IP bloquerait tout le monde d'un coup.
  TRUST_PROXY: z.coerce.number().int().min(0).max(5).default(0),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  // Message lisible au démarrage plutôt qu'une erreur obscure plus tard.
  console.error('Configuration invalide :', parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
  process.exit(1);
}

// Garde-fous de production : un secret d'exemple ou une origine « * » ne doivent jamais partir en ligne.
if (parsed.data.NODE_ENV === 'production') {
  const problems: string[] = [];
  if (/remplace-moi|changeme|secret/i.test(parsed.data.JWT_SECRET)) problems.push('JWT_SECRET ressemble à une valeur d’exemple');
  if (parsed.data.CORS_ORIGIN.split(',').some((o) => o.trim() === '*')) problems.push('CORS_ORIGIN ne doit pas contenir « * »');
  if (problems.length > 0) {
    console.error('Configuration de production refusée :', problems.join('; '));
    process.exit(1);
  }
}

export const env = parsed.data;
