import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { signToken } from '../../core/auth.middleware.ts';
import { env } from '../../core/env.ts';
import { AppError } from '../../core/errors.ts';
import { prisma } from '../../core/prisma.ts';
import type { loginSchema, registerSchema, updateProfileSchema } from './auth.schemas.ts';

const MAX_FAILED_ATTEMPTS = 5;
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
// Coût réduit en test uniquement : bcrypt à 12 rendrait la suite de tests très lente.
const BCRYPT_COST = env.NODE_ENV === 'test' ? 4 : 12;

// Hash factice pour comparer même quand l'e-mail n'existe pas : le temps de réponse ne
// trahit pas l'existence d'un compte.
const DUMMY_HASH = bcrypt.hashSync('objectiva-dummy-password', BCRYPT_COST);

function publicUser(u: { id: string; email: string; displayName: string; timezone: string }) {
  return { id: u.id, email: u.email, displayName: u.displayName, timezone: u.timezone };
}

async function openSession(userId: string) {
  const expiresAt = new Date(Date.now() + env.SESSION_DAYS * 86_400_000);
  const session = await prisma.session.create({ data: { userId, expiresAt } });
  return { token: signToken(userId, session.id, expiresAt), expiresAt: expiresAt.toISOString() };
}

export async function register(input: z.infer<typeof registerSchema>) {
  const existing = await prisma.user.findUnique({ where: { email: input.email }, select: { id: true } });
  if (existing) throw new AppError(409, 'EMAIL_TAKEN', 'Un compte existe déjà avec cette adresse');

  const user = await prisma.user.create({
    data: {
      email: input.email,
      passwordHash: await bcrypt.hash(input.password, BCRYPT_COST),
      displayName: input.displayName,
      timezone: input.timezone ?? 'Europe/Paris',
    },
  });
  return { user: publicUser(user), ...(await openSession(user.id)) };
}

export async function login(input: z.infer<typeof loginSchema>) {
  const since = new Date(Date.now() - ATTEMPT_WINDOW_MS);
  const failed = await prisma.loginAttempt.count({ where: { email: input.email, createdAt: { gte: since } } });
  if (failed >= MAX_FAILED_ATTEMPTS) {
    throw new AppError(429, 'TOO_MANY_ATTEMPTS', 'Trop de tentatives. Réessaie dans 15 minutes.');
  }

  const user = await prisma.user.findUnique({ where: { email: input.email } });
  const ok = await bcrypt.compare(input.password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !ok) {
    await prisma.loginAttempt.create({ data: { email: input.email } });
    throw new AppError(401, 'INVALID_CREDENTIALS', 'E-mail ou mot de passe incorrect');
  }

  await prisma.loginAttempt.deleteMany({ where: { email: input.email } });
  return { user: publicUser(user), ...(await openSession(user.id)) };
}

export async function logout(sessionId: string) {
  await prisma.session.updateMany({ where: { id: sessionId, revokedAt: null }, data: { revokedAt: new Date() } });
}

export async function me(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  return publicUser(user);
}

export async function updateProfile(userId: string, input: z.infer<typeof updateProfileSchema>) {
  const user = await prisma.user.update({ where: { id: userId }, data: input });
  return publicUser(user);
}
