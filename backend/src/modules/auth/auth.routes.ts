import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { currentUser, requireAuth } from '../../core/auth.middleware.ts';
import { env } from '../../core/env.ts';
import { parseInput } from '../../core/errors.ts';
import { loginSchema, registerSchema, updateProfileSchema } from './auth.schemas.ts';
import * as auth from './auth.service.ts';

// Limite par adresse IP, en plus de la limite par e-mail du service (qui, elle, ne bloque
// pas un attaquant essayant beaucoup d'e-mails différents).
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skip: () => env.NODE_ENV === 'test',
  message: { success: false, code: 'TOO_MANY_ATTEMPTS', message: 'Trop de tentatives. Réessaie dans 15 minutes.' },
});

export const authRouter = Router();

authRouter.post('/register', authLimiter, async (req, res) => {
  const data = await auth.register(parseInput(registerSchema, req.body));
  res.status(201).json({ success: true, data });
});

authRouter.post('/login', authLimiter, async (req, res) => {
  const data = await auth.login(parseInput(loginSchema, req.body));
  res.json({ success: true, data });
});

authRouter.post('/logout', requireAuth, async (req, res) => {
  await auth.logout(req.sessionId!);
  res.json({ success: true, message: 'Déconnecté' });
});

authRouter.get('/me', requireAuth, async (req, res) => {
  res.json({ success: true, data: await auth.me(currentUser(req).userId) });
});

authRouter.patch('/me', requireAuth, async (req, res) => {
  const data = await auth.updateProfile(currentUser(req).userId, parseInput(updateProfileSchema, req.body));
  res.json({ success: true, data });
});
