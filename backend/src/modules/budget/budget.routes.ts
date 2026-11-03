import { Router } from 'express';
import { currentUser } from '../../core/auth.middleware.ts';
import { todayIn } from '../../core/dates.ts';
import { parseInput } from '../../core/errors.ts';
import { idParam } from '../../core/ids.ts';
import {
  createAccountSchema,
  createCategorySchema,
  createOperationSchema,
  createTransactionSchema,
  envelopeSchema,
  listAccountsQuery,
  listCategoriesQuery,
  monthParam,
  settleSchema,
  updateAccountSchema,
  updateCategorySchema,
  updateOperationSchema,
} from './budget.schemas.ts';
import * as budget from './budget.service.ts';
import * as operations from './operations.service.ts';

export const budgetRouter = Router();

// Démarrage (idempotent)
budgetRouter.post('/setup', async (req, res) => {
  res.json({ success: true, data: await budget.setupBudget(currentUser(req).userId) });
});

// Comptes
budgetRouter.get('/accounts', async (req, res) => {
  const data = await budget.listAccounts(currentUser(req).userId, parseInput(listAccountsQuery, req.query));
  res.json({ success: true, data });
});
budgetRouter.post('/accounts', async (req, res) => {
  const data = await budget.createAccount(currentUser(req).userId, parseInput(createAccountSchema, req.body));
  res.status(201).json({ success: true, data });
});
budgetRouter.patch('/accounts/:id', async (req, res) => {
  const data = await budget.updateAccount(
    currentUser(req).userId,
    idParam(req.params.id, 'Compte'),
    parseInput(updateAccountSchema, req.body),
  );
  res.json({ success: true, data });
});

// Catégories
budgetRouter.get('/categories', async (req, res) => {
  const data = await budget.listCategories(currentUser(req).userId, parseInput(listCategoriesQuery, req.query));
  res.json({ success: true, data });
});
budgetRouter.post('/categories', async (req, res) => {
  const data = await budget.createCategory(currentUser(req).userId, parseInput(createCategorySchema, req.body));
  res.status(201).json({ success: true, data });
});
budgetRouter.patch('/categories/:id', async (req, res) => {
  const data = await budget.updateCategory(
    currentUser(req).userId,
    idParam(req.params.id, 'Catégorie'),
    parseInput(updateCategorySchema, req.body),
  );
  res.json({ success: true, data });
});

// Mois et enveloppes
budgetRouter.get('/months/:month', async (req, res) => {
  const { month } = parseInput(monthParam, req.params);
  res.json({ success: true, data: await budget.getMonth(currentUser(req).userId, month) });
});
budgetRouter.put('/envelopes', async (req, res) => {
  res.json({ success: true, data: await budget.setEnvelope(currentUser(req).userId, parseInput(envelopeSchema, req.body)) });
});

// Prévisions
budgetRouter.post('/operations', async (req, res) => {
  const data = await operations.createOperation(currentUser(req).userId, parseInput(createOperationSchema, req.body));
  res.status(201).json({ success: true, data });
});
budgetRouter.patch('/operations/:id', async (req, res) => {
  const data = await operations.updateOperation(
    currentUser(req).userId,
    idParam(req.params.id, 'Prévision'),
    parseInput(updateOperationSchema, req.body),
  );
  res.json({ success: true, data });
});
budgetRouter.delete('/operations/:id', async (req, res) => {
  await operations.deleteOperation(currentUser(req).userId, idParam(req.params.id, 'Prévision'));
  res.json({ success: true, message: 'Prévision supprimée' });
});
budgetRouter.post('/operations/:id/settle', async (req, res) => {
  const { userId, timezone } = currentUser(req);
  const data = await operations.settleOperation(
    userId,
    idParam(req.params.id, 'Prévision'),
    todayIn(timezone),
    parseInput(settleSchema, req.body),
  );
  // 201 à la première écriture, 200 quand la requête est un double appui rejoué.
  res.status(data.replayed ? 200 : 201).json({ success: true, data });
});

// Transactions réelles
budgetRouter.post('/transactions', async (req, res) => {
  const { userId, timezone } = currentUser(req);
  const data = await operations.createTransaction(userId, todayIn(timezone), parseInput(createTransactionSchema, req.body));
  res.status(data.replayed ? 200 : 201).json({ success: true, data });
});
budgetRouter.delete('/transactions/:id', async (req, res) => {
  const data = await operations.deleteTransaction(currentUser(req).userId, idParam(req.params.id, 'Transaction'));
  res.json({ success: true, data });
});
