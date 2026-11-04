import { z } from 'zod';
import { fromDbDate, toDbDate } from '../../core/dates.ts';
import { AppError, notFound } from '../../core/errors.ts';
import { prisma } from '../../core/prisma.ts';
import type { Account, BudgetCategory, MoneyType, Prisma } from '../../generated/prisma/client.ts';
import { accountBalance, envelopeFigures, monthBounds, monthSummary, settlementFigures } from './budget.rules.ts';
import type {
  createAccountSchema,
  createCategorySchema,
  envelopeSchema,
  listAccountsQuery,
  listCategoriesQuery,
  updateAccountSchema,
  updateCategorySchema,
} from './budget.schemas.ts';

// ---------------------------------------------------------------------------------------------
// Utilitaires partagés avec operations.service.ts

type Db = Prisma.TransactionClient | typeof prisma;

/** Violation de contrainte d'unicité (code Prisma P2002). */
export function isUniqueViolation(e: unknown): boolean {
  return typeof e === 'object' && e !== null && 'code' in e && (e as { code: unknown }).code === 'P2002';
}

const conflict = (message: string) => new AppError(409, 'CONFLICT', message);

export async function requireAccount(userId: string, accountId: string, db: Db = prisma): Promise<Account> {
  const a = await db.account.findFirst({ where: { id: accountId, userId } });
  if (!a) throw notFound('Compte');
  if (a.archivedAt) throw conflict('Ce compte est archivé : choisis un autre compte');
  return a;
}

/** La catégorie doit appartenir à l'utilisateur, être active et du même type que l'opération. */
export async function requireCategory(userId: string, categoryId: string, type: MoneyType, db: Db = prisma): Promise<BudgetCategory> {
  const c = await db.budgetCategory.findFirst({ where: { id: categoryId, userId } });
  if (!c) throw notFound('Catégorie');
  if (c.archivedAt) throw conflict('Cette catégorie est archivée : choisis-en une autre');
  if (c.type !== type) {
    throw new AppError(400, 'VALIDATION_ERROR', "Cette catégorie ne correspond pas au type de l'opération", [
      { field: 'categoryId', message: "Cette catégorie ne correspond pas au type de l'opération" },
    ]);
  }
  return c;
}

export function serializeTransaction(t: {
  id: string;
  type: MoneyType;
  amount: number;
  date: Date;
  accountId: string;
  categoryId: string | null;
  plannedOperationId: string | null;
  label: string | null;
  createdAt: Date;
}) {
  return {
    id: t.id,
    type: t.type,
    amount: t.amount,
    date: fromDbDate(t.date),
    accountId: t.accountId,
    categoryId: t.categoryId,
    plannedOperationId: t.plannedOperationId,
    label: t.label,
    createdAt: t.createdAt.toISOString(),
  };
}

export function serializeOperation(
  o: {
    id: string;
    type: MoneyType;
    label: string;
    plannedAmount: number;
    dueDate: Date;
    categoryId: string | null;
    accountId: string | null;
    status: 'PREVUE' | 'PARTIELLE' | 'SOLDEE' | 'ANNULEE';
    closedAt: Date | null;
  },
  paid: number,
) {
  const figures = settlementFigures({
    plannedAmount: o.plannedAmount,
    paid,
    closed: o.closedAt !== null,
    cancelled: o.status === 'ANNULEE',
    status: o.status,
  });
  return {
    id: o.id,
    type: o.type,
    label: o.label,
    plannedAmount: o.plannedAmount,
    dueDate: fromDbDate(o.dueDate),
    categoryId: o.categoryId,
    accountId: o.accountId,
    status: o.status,
    ...figures,
    closedAt: o.closedAt?.toISOString() ?? null,
  };
}

// ---------------------------------------------------------------------------------------------
// Comptes

async function balances(userId: string, accountIds: string[]): Promise<Map<string, { type: MoneyType; amount: number }[]>> {
  const rows = await prisma.transaction.groupBy({
    by: ['accountId', 'type'],
    where: { userId, accountId: { in: accountIds } },
    _sum: { amount: true },
  });
  const map = new Map<string, { type: MoneyType; amount: number }[]>();
  for (const r of rows) {
    map.set(r.accountId, [...(map.get(r.accountId) ?? []), { type: r.type, amount: r._sum.amount ?? 0 }]);
  }
  return map;
}

function serializeAccount(a: Account, txs: { type: MoneyType; amount: number }[]) {
  return {
    id: a.id,
    name: a.name,
    kind: a.kind,
    openingBalance: a.openingBalance,
    balance: accountBalance(a.openingBalance, txs),
    archived: a.archivedAt !== null,
  };
}

export async function listAccounts(userId: string, q: z.infer<typeof listAccountsQuery> = {}) {
  const accounts = await prisma.account.findMany({
    where: { userId, archivedAt: q.archived ? { not: null } : null },
    orderBy: { createdAt: 'asc' },
  });
  const sums = await balances(userId, accounts.map((a) => a.id));
  return accounts.map((a) => serializeAccount(a, sums.get(a.id) ?? []));
}

export async function createAccount(userId: string, input: z.infer<typeof createAccountSchema>) {
  try {
    const a = await prisma.account.create({
      data: { id: input.id, userId, name: input.name, kind: input.kind, openingBalance: input.openingBalance ?? 0 },
    });
    return serializeAccount(a, []);
  } catch (e) {
    if (isUniqueViolation(e)) throw conflict('Un compte porte déjà ce nom');
    throw e;
  }
}

export async function updateAccount(userId: string, accountId: string, input: z.infer<typeof updateAccountSchema>) {
  const existing = await prisma.account.findFirst({ where: { id: accountId, userId } });
  if (!existing) throw notFound('Compte');
  try {
    const a = await prisma.account.update({
      where: { id: accountId },
      data: {
        name: input.name,
        openingBalance: input.openingBalance,
        archivedAt: input.archived === undefined ? undefined : input.archived ? (existing.archivedAt ?? new Date()) : null,
      },
    });
    const sums = await balances(userId, [a.id]);
    return serializeAccount(a, sums.get(a.id) ?? []);
  } catch (e) {
    if (isUniqueViolation(e)) throw conflict('Un compte porte déjà ce nom');
    throw e;
  }
}

// ---------------------------------------------------------------------------------------------
// Catégories

function serializeCategory(c: BudgetCategory) {
  return { id: c.id, name: c.name, type: c.type, archived: c.archivedAt !== null };
}

export async function listCategories(userId: string, q: z.infer<typeof listCategoriesQuery> = {}) {
  const items = await prisma.budgetCategory.findMany({
    where: { userId, type: q.type, archivedAt: q.archived ? { not: null } : null },
    orderBy: [{ type: 'asc' }, { name: 'asc' }],
  });
  return items.map(serializeCategory);
}

export async function createCategory(userId: string, input: z.infer<typeof createCategorySchema>) {
  try {
    return serializeCategory(await prisma.budgetCategory.create({ data: { id: input.id, userId, name: input.name, type: input.type } }));
  } catch (e) {
    if (isUniqueViolation(e)) throw conflict('Une catégorie du même type porte déjà ce nom');
    throw e;
  }
}

export async function updateCategory(userId: string, categoryId: string, input: z.infer<typeof updateCategorySchema>) {
  const existing = await prisma.budgetCategory.findFirst({ where: { id: categoryId, userId } });
  if (!existing) throw notFound('Catégorie');
  try {
    const c = await prisma.budgetCategory.update({
      where: { id: categoryId },
      data: {
        name: input.name,
        archivedAt: input.archived === undefined ? undefined : input.archived ? (existing.archivedAt ?? new Date()) : null,
      },
    });
    return serializeCategory(c);
  } catch (e) {
    if (isUniqueViolation(e)) throw conflict('Une catégorie du même type porte déjà ce nom');
    throw e;
  }
}

// ---------------------------------------------------------------------------------------------
// Démarrage : un compte et des catégories par défaut, une seule fois

const DEFAULT_CATEGORIES: { type: MoneyType; names: string[] }[] = [
  { type: 'DEPENSE', names: ['Logement', 'Alimentation', 'Transport', 'Santé', 'Éducation', 'Loisirs', 'Autres dépenses'] },
  { type: 'REVENU', names: ['Salaire', 'Activité', 'Autres revenus'] },
  { type: 'EPARGNE', names: ['Épargne'] },
];

/** Idempotent : les contraintes d'unicité et `skipDuplicates` rendent un double appui sans effet. */
export async function setupBudget(userId: string) {
  await prisma.$transaction(async (tx) => {
    const hasAccount = await tx.account.count({ where: { userId } });
    if (hasAccount === 0) {
      await tx.account.createMany({ data: [{ userId, name: 'Espèces', kind: 'ESPECES' }], skipDuplicates: true });
    }
    const hasCategory = await tx.budgetCategory.count({ where: { userId } });
    if (hasCategory === 0) {
      await tx.budgetCategory.createMany({
        data: DEFAULT_CATEGORIES.flatMap((g) => g.names.map((name) => ({ userId, type: g.type, name }))),
        skipDuplicates: true,
      });
    }
  });
  return { accounts: await listAccounts(userId), categories: await listCategories(userId) };
}

// ---------------------------------------------------------------------------------------------
// Enveloppes

export async function setEnvelope(userId: string, input: z.infer<typeof envelopeSchema>) {
  const category = await prisma.budgetCategory.findFirst({
    where: { id: input.categoryId, userId, archivedAt: null },
    select: { id: true },
  });
  if (!category) throw notFound('Catégorie');
  const month = toDbDate(`${input.month}-01`);
  const where = { userId_categoryId_month: { userId, categoryId: input.categoryId, month } };
  if (input.plannedAmount === 0) {
    await prisma.envelope.deleteMany({ where: { userId, categoryId: input.categoryId, month } });
  } else {
    await prisma.envelope.upsert({
      where,
      create: { userId, categoryId: input.categoryId, month, plannedAmount: input.plannedAmount },
      update: { plannedAmount: input.plannedAmount },
    });
  }
  return { month: input.month, categoryId: input.categoryId, plannedAmount: input.plannedAmount };
}

// ---------------------------------------------------------------------------------------------
// Vue d'un mois

export async function getMonth(userId: string, month: string) {
  const { from, to } = monthBounds(month);
  const range = { gte: toDbDate(from), lte: toDbDate(to) };

  const [user, accounts, categories, operations, transactions, envelopes] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { currency: true } }),
    listAccounts(userId),
    listCategories(userId),
    prisma.plannedOperation.findMany({ where: { userId, dueDate: range }, orderBy: [{ dueDate: 'asc' }, { createdAt: 'asc' }] }),
    prisma.transaction.findMany({ where: { userId, date: range }, orderBy: [{ date: 'desc' }, { createdAt: 'desc' }] }),
    prisma.envelope.findMany({ where: { userId, month: toDbDate(from) } }),
  ]);

  // Montant payé par prévision, tous mois confondus (un règlement peut avoir lieu un autre mois).
  const paidRows = operations.length
    ? await prisma.transaction.groupBy({
        by: ['plannedOperationId'],
        where: { userId, plannedOperationId: { in: operations.map((o) => o.id) } },
        _sum: { amount: true },
      })
    : [];
  const paid = new Map(paidRows.map((r) => [r.plannedOperationId, r._sum.amount ?? 0]));
  const ops = operations.map((o) => serializeOperation(o, paid.get(o.id) ?? 0));

  const spentByCategory = new Map<string, number>();
  for (const t of transactions) {
    if (t.categoryId && t.type !== 'REVENU') spentByCategory.set(t.categoryId, (spentByCategory.get(t.categoryId) ?? 0) + t.amount);
  }
  const plannedByCategory = new Map(envelopes.map((e) => [e.categoryId, e.plannedAmount]));
  const categoryById = new Map((await prisma.budgetCategory.findMany({ where: { userId } })).map((c) => [c.id, c]));
  const envelopeIds = new Set([...plannedByCategory.keys(), ...spentByCategory.keys()]);
  const envelopeRows = [...envelopeIds]
    .map((id) => ({
      categoryId: id,
      categoryName: categoryById.get(id)?.name ?? 'Catégorie',
      type: categoryById.get(id)?.type ?? 'DEPENSE',
      ...envelopeFigures(plannedByCategory.get(id) ?? 0, spentByCategory.get(id) ?? 0),
    }))
    .sort((a, b) => a.categoryName.localeCompare(b.categoryName, 'fr'));

  return {
    month,
    currency: user.currency,
    needsSetup: accounts.length === 0,
    summary: monthSummary(
      operations.map((o, i) => ({ type: o.type, plannedAmount: o.plannedAmount, status: o.status, paid: ops[i]!.paid })),
      transactions,
    ),
    accounts,
    totalBalance: accounts.reduce((s, a) => s + a.balance, 0),
    categories,
    envelopes: envelopeRows,
    operations: ops,
    transactions: transactions.map(serializeTransaction),
  };
}
