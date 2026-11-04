import { Router } from 'express';
import { currentUser } from '../../core/auth.middleware.ts';
import { parseInput } from '../../core/errors.ts';
import { requireProtocol } from '../../core/protocol.ts';
import { pullQuery, pushSchema } from '../../../../shared/src/sync.schemas.ts';
import * as sync from './sync.service.ts';

// Synchronisation : le protocole est vérifié avant toute lecture ou écriture (426 sinon).
export const syncRouter = Router();
syncRouter.use(requireProtocol);

syncRouter.get('/pull', async (req, res) => {
  const q = parseInput(pullQuery, req.query);
  res.json({ success: true, data: await sync.pull(currentUser(req).userId, q.cursor, q.limit) });
});

syncRouter.post('/push', async (req, res) => {
  const body = parseInput(pushSchema, req.body);
  res.json({ success: true, data: await sync.push(currentUser(req).userId, body) });
});
