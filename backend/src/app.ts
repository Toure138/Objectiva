import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { requireAuth } from './core/auth.middleware.ts';
import { env } from './core/env.ts';
import { errorHandler, notFoundRoute } from './core/errors.ts';
import { authRouter } from './modules/auth/auth.routes.ts';
import { budgetRouter } from './modules/budget/budget.routes.ts';
import { eventsRouter } from './modules/events/events.routes.ts';
import { goalsRouter, milestonesRouter, readingsRouter } from './modules/goals/goals.routes.ts';
import { reviewsRouter } from './modules/reviews/reviews.routes.ts';
import { tasksRouter } from './modules/tasks/tasks.routes.ts';
import { todayRouter } from './modules/today/today.routes.ts';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());

  const origins = env.CORS_ORIGIN.split(',').map((o) => o.trim()).filter(Boolean);
  app.use(
    cors({
      origin: (origin, cb) => {
        // Pas d'en-tête Origin : appel natif (Capacitor), curl ou tests.
        if (!origin || origins.includes(origin) || origins.includes('*')) return cb(null, true);
        cb(null, false);
      },
    }),
  );
  app.use(express.json({ limit: '100kb' }));

  app.get('/health', (_req, res) => {
    res.json({ success: true, data: { status: 'ok' } });
  });

  app.use('/api/auth', authRouter);
  app.use('/api/goals', requireAuth, goalsRouter);
  app.use('/api/milestones', requireAuth, milestonesRouter);
  app.use('/api/readings', requireAuth, readingsRouter);
  app.use('/api/budget', requireAuth, budgetRouter);
  app.use('/api/events', requireAuth, eventsRouter);
  app.use('/api/tasks', requireAuth, tasksRouter);
  app.use('/api/today', requireAuth, todayRouter);
  app.use('/api/reviews', requireAuth, reviewsRouter);

  app.use(notFoundRoute);
  app.use(errorHandler);
  return app;
}
