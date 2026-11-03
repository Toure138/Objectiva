import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from './env.ts';
import { AppError } from './errors.ts';
import { prisma } from './prisma.ts';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      userId?: string;
      sessionId?: string;
      userTimezone?: string;
    }
  }
}

interface TokenPayload {
  sub: string;
  sid: string;
}

export function signToken(userId: string, sessionId: string, expiresAt: Date): string {
  const expiresIn = Math.max(1, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
  return jwt.sign({ sub: userId, sid: sessionId } satisfies TokenPayload, env.JWT_SECRET, { expiresIn });
}

export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    throw new AppError(401, 'UNAUTHENTICATED', 'Connecte-toi pour continuer');
  }
  let payload: TokenPayload;
  try {
    payload = jwt.verify(header.slice(7), env.JWT_SECRET) as TokenPayload;
  } catch {
    throw new AppError(401, 'UNAUTHENTICATED', 'Session expirée, reconnecte-toi');
  }
  // Le jeton seul ne suffit pas : la session doit encore exister et ne pas être révoquée.
  const session = await prisma.session.findUnique({
    where: { id: payload.sid },
    select: { userId: true, expiresAt: true, revokedAt: true, user: { select: { timezone: true } } },
  });
  if (!session || session.userId !== payload.sub || session.revokedAt || session.expiresAt < new Date()) {
    throw new AppError(401, 'UNAUTHENTICATED', 'Session expirée, reconnecte-toi');
  }
  req.userId = session.userId;
  req.sessionId = payload.sid;
  req.userTimezone = session.user.timezone;
  next();
}

// À appeler dans les handlers protégés : évite les `req.userId!` dispersés.
export function currentUser(req: Request): { userId: string; timezone: string } {
  if (!req.userId) throw new AppError(401, 'UNAUTHENTICATED', 'Connecte-toi pour continuer');
  return { userId: req.userId, timezone: req.userTimezone ?? 'UTC' };
}
