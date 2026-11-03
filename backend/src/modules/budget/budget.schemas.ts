import { z } from 'zod';
import { dateOnly } from '../../core/dates.ts';
import { optionalId } from '../../core/ids.ts';
import { MAX_AMOUNT } from './budget.rules.ts';

// Montants : entiers dans la plus petite unité de la devise. Un décimal est refusé, jamais arrondi.
const amountMsg = { message: 'Un montant entier est attendu' };
const amount = z
  .number(amountMsg)
  .int('Un montant entier est attendu')
  .min(1, 'Le montant doit être supérieur à zéro')
  .max(MAX_AMOUNT, 'Montant trop élevé');
const signedAmount = z.number(amountMsg).int('Un montant entier est attendu').min(-MAX_AMOUNT).max(MAX_AMOUNT);

export const moneyType = z.enum(['REVENU', 'DEPENSE', 'EPARGNE'], { message: 'Type inconnu' });
export const accountKind = z.enum(['ESPECES', 'BANQUE', 'MOBILE_MONEY'], { message: 'Type de compte inconnu' });

const name = z.string().trim().min(1, 'Le nom est obligatoire').max(60);
const idempotencyKey = z.string().trim().min(8, 'Clé d’idempotence trop courte').max(80);
const requiredId = z.string().uuid('Identifiant invalide');

export const monthParam = z.object({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Mois attendu : AAAA-MM'),
});

export const createAccountSchema = z.object({
  name,
  kind: accountKind,
  openingBalance: signedAmount.optional(),
});
export const updateAccountSchema = z.object({
  name: name.optional(),
  openingBalance: signedAmount.optional(),
  archived: z.boolean().optional(),
});

export const listAccountsQuery = z.object({ archived: z.enum(['true', 'false']).transform((v) => v === 'true').optional() });

export const createCategorySchema = z.object({ name, type: moneyType });
export const updateCategorySchema = z.object({ name: name.optional(), archived: z.boolean().optional() });
export const listCategoriesQuery = z.object({
  type: moneyType.optional(),
  archived: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
});

export const envelopeSchema = z.object({
  month: monthParam.shape.month,
  categoryId: requiredId,
  // 0 retire l'enveloppe.
  plannedAmount: z.number(amountMsg).int('Un montant entier est attendu').min(0).max(MAX_AMOUNT, 'Montant trop élevé'),
});

export const createOperationSchema = z.object({
  type: moneyType,
  label: z.string().trim().min(1, 'Le libellé est obligatoire').max(120),
  plannedAmount: amount,
  dueDate: dateOnly,
  categoryId: optionalId,
  accountId: optionalId,
});

export const updateOperationSchema = z.object({
  label: z.string().trim().min(1, 'Le libellé est obligatoire').max(120).optional(),
  plannedAmount: amount.optional(),
  dueDate: dateOnly.optional(),
  categoryId: optionalId,
  accountId: optionalId,
  cancelled: z.boolean().optional(),
});

export const settleSchema = z.object({
  amount,
  accountId: requiredId,
  date: dateOnly.optional(),
  // Solder : la prévision est terminée même si le montant payé est inférieur ; la différence est une économie.
  close: z.boolean().optional(),
  // Obligatoire : un double appui rejoue la même clé et ne crée jamais une seconde écriture.
  idempotencyKey,
});

export const createTransactionSchema = z.object({
  type: moneyType,
  amount,
  date: dateOnly,
  accountId: requiredId,
  categoryId: optionalId,
  label: z.string().trim().max(120).nullable().optional(),
  idempotencyKey: idempotencyKey.optional(),
});
