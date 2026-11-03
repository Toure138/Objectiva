import { z } from 'zod';
import { toDbDate } from '../../core/dates.ts';
import { AppError, notFound } from '../../core/errors.ts';
import { prisma } from '../../core/prisma.ts';
import type { PlannedOperation, Prisma, Transaction } from '../../generated/prisma/client.ts';
import { settlementStatus } from './budget.rules.ts';
import {
  isUniqueViolation,
  requireAccount,
  requireCategory,
  serializeOperation,
  serializeTransaction,
} from './budget.service.ts';
import type {
  createOperationSchema,
  createTransactionSchema,
  settleSchema,
  updateOperationSchema,
} from './budget.schemas.ts';

const conflict = (message: string) => new AppError(409, 'CONFLICT', message);
type Tx = Prisma.TransactionClient;

async function paidOf(db: Tx | typeof prisma, operationId: string): Promise<number> {
  const r = await db.transaction.aggregate({ where: { plannedOperationId: operationId }, _sum: { amount: true } });
  return r._sum.amount ?? 0;
}

async function findOwnedOperation(userId: string, operationId: string, db: Tx | typeof prisma = prisma) {
  const op = await db.plannedOperation.findFirst({ where: { id: operationId, userId } });
  if (!op) throw notFound('Prévision');
  return op;
}

/** Verrouille la ligne de la prévision jusqu'à la fin de la transaction : les règlements d'une même prévision passent l'un après l'autre. */
async function lockOperation(tx: Tx, operationId: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM planned_operations WHERE id = ${operationId}::uuid FOR UPDATE`;
}

// ---------------------------------------------------------------------------------------------
// Prévisions

export async function createOperation(userId: string, input: z.infer<typeof createOperationSchema>) {
  if (input.categoryId) await requireCategory(userId, input.categoryId, input.type);
  if (input.accountId) await requireAccount(userId, input.accountId);
  const op = await prisma.plannedOperation.create({
    data: {
      userId,
      type: input.type,
      label: input.label,
      plannedAmount: input.plannedAmount,
      dueDate: toDbDate(input.dueDate),
      categoryId: input.categoryId ?? null,
      accountId: input.accountId ?? null,
    },
  });
  return serializeOperation(op, 0);
}

export async function updateOperation(userId: string, operationId: string, input: z.infer<typeof updateOperationSchema>) {
  const existing = await findOwnedOperation(userId, operationId);
  if (input.categoryId) await requireCategory(userId, input.categoryId, existing.type);
  if (input.accountId) await requireAccount(userId, input.accountId);

  return prisma.$transaction(async (tx) => {
    await lockOperation(tx, operationId);
    const paid = await paidOf(tx, operationId);
    const plannedAmount = input.plannedAmount ?? existing.plannedAmount;
    // Changer le montant prévu rouvre l'évaluation : une clôture ancienne ne vaut plus.
    const closedAt = input.plannedAmount !== undefined && input.plannedAmount !== existing.plannedAmount ? null : existing.closedAt;
    const cancelled = input.cancelled ?? existing.status === 'ANNULEE';
    const status = settlementStatus({ plannedAmount, paid, closed: closedAt !== null, cancelled });
    const updated = await tx.plannedOperation.update({
      where: { id: operationId },
      data: {
        label: input.label,
        plannedAmount: input.plannedAmount,
        dueDate: input.dueDate ? toDbDate(input.dueDate) : undefined,
        categoryId: input.categoryId,
        accountId: input.accountId,
        closedAt,
        status,
      },
    });
    return serializeOperation(updated, paid);
  });
}

export async function deleteOperation(userId: string, operationId: string) {
  await findOwnedOperation(userId, operationId);
  // Les transactions réelles déjà enregistrées sont conservées (leur lien est mis à NULL par la base).
  await prisma.plannedOperation.delete({ where: { id: operationId } });
}

// ---------------------------------------------------------------------------------------------
// Règlement idempotent

async function findByKey(userId: string, key: string): Promise<Transaction | null> {
  return prisma.transaction.findUnique({ where: { userId_idempotencyKey: { userId, idempotencyKey: key } } });
}

async function replaySettlement(userId: string, operationId: string, existing: Transaction) {
  if (existing.plannedOperationId !== operationId) {
    throw conflict('Cette clé d’idempotence est déjà utilisée pour une autre opération');
  }
  const op = await findOwnedOperation(userId, operationId);
  return { operation: serializeOperation(op, await paidOf(prisma, operationId)), transaction: serializeTransaction(existing), replayed: true };
}

/**
 * Règle une prévision en une ou plusieurs fois. Transaction réelle + statut de la prévision sont écrits
 * ensemble ; une clé d'idempotence rejouée renvoie le premier résultat sans rien écrire.
 */
export async function settleOperation(userId: string, operationId: string, today: string, input: z.infer<typeof settleSchema>) {
  const first = await findByKey(userId, input.idempotencyKey);
  if (first) return replaySettlement(userId, operationId, first);

  try {
    return await prisma.$transaction(async (tx) => {
      await findOwnedOperation(userId, operationId, tx);
      await lockOperation(tx, operationId);
      // Après le verrou : une requête identique qui attendait revoit ici la première écriture.
      const raced = await tx.transaction.findUnique({
        where: { userId_idempotencyKey: { userId, idempotencyKey: input.idempotencyKey } },
      });
      if (raced) return null;

      const op: PlannedOperation = await findOwnedOperation(userId, operationId, tx);
      if (op.status === 'ANNULEE') throw conflict('Cette prévision est annulée : rouvre-la pour la régler');
      if (op.status === 'SOLDEE') throw conflict('Cette prévision est déjà soldée');
      await requireAccount(userId, input.accountId, tx);

      const created = await tx.transaction.create({
        data: {
          userId,
          accountId: input.accountId,
          categoryId: op.categoryId,
          plannedOperationId: op.id,
          type: op.type,
          amount: input.amount,
          date: toDbDate(input.date ?? today),
          label: op.label,
          idempotencyKey: input.idempotencyKey,
        },
      });
      const paid = await paidOf(tx, op.id);
      const closedAt = input.close ? new Date() : op.closedAt;
      const status = settlementStatus({ plannedAmount: op.plannedAmount, paid, closed: closedAt !== null, cancelled: false });
      const updated = await tx.plannedOperation.update({ where: { id: op.id }, data: { status, closedAt } });
      return { operation: serializeOperation(updated, paid), transaction: serializeTransaction(created), replayed: false };
    }).then(async (result) => result ?? replaySettlement(userId, operationId, (await findByKey(userId, input.idempotencyKey))!));
  } catch (e) {
    // Deux requêtes identiques en même temps : la base refuse la seconde, on renvoie la première.
    if (isUniqueViolation(e)) {
      const existing = await findByKey(userId, input.idempotencyKey);
      if (existing) return replaySettlement(userId, operationId, existing);
    }
    throw e;
  }
}

// ---------------------------------------------------------------------------------------------
// Transactions réelles

export async function createTransaction(userId: string, today: string, input: z.infer<typeof createTransactionSchema>) {
  if (input.idempotencyKey) {
    const first = await findByKey(userId, input.idempotencyKey);
    if (first) return { transaction: serializeTransaction(first), replayed: true };
  }
  await requireAccount(userId, input.accountId);
  if (input.categoryId) await requireCategory(userId, input.categoryId, input.type);
  try {
    const t = await prisma.transaction.create({
      data: {
        userId,
        accountId: input.accountId,
        categoryId: input.categoryId ?? null,
        type: input.type,
        amount: input.amount,
        date: toDbDate(input.date ?? today),
        label: input.label ?? null,
        idempotencyKey: input.idempotencyKey ?? null,
      },
    });
    return { transaction: serializeTransaction(t), replayed: false };
  } catch (e) {
    if (isUniqueViolation(e) && input.idempotencyKey) {
      const existing = await findByKey(userId, input.idempotencyKey);
      if (existing) return { transaction: serializeTransaction(existing), replayed: true };
    }
    throw e;
  }
}

/** Supprime une transaction et recalcule la prévision liée (rouverte si le payé repasse sous le prévu). */
export async function deleteTransaction(userId: string, transactionId: string) {
  return prisma.$transaction(async (tx) => {
    const t = await tx.transaction.findFirst({ where: { id: transactionId, userId } });
    if (!t) throw notFound('Transaction');
    if (t.plannedOperationId) await lockOperation(tx, t.plannedOperationId);
    await tx.transaction.delete({ where: { id: transactionId } });
    if (!t.plannedOperationId) return { operation: null };

    const op = await tx.plannedOperation.findUniqueOrThrow({ where: { id: t.plannedOperationId } });
    const paid = await paidOf(tx, op.id);
    const closedAt = paid < op.plannedAmount ? null : op.closedAt;
    const status = settlementStatus({
      plannedAmount: op.plannedAmount,
      paid,
      closed: closedAt !== null,
      cancelled: op.status === 'ANNULEE',
    });
    const updated = await tx.plannedOperation.update({ where: { id: op.id }, data: { status, closedAt } });
    return { operation: serializeOperation(updated, paid) };
  });
}
