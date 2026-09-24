import { prisma } from "@/server/db/prisma";
import { NotFoundError, ValidationError } from "@/server/lib/errors";
import { writeAuditLog } from "@/server/modules/audit/audit.service";
import type { SessionUser } from "@/server/modules/auth/session.service";
import { assertPermission } from "@/server/rbac/authorize";
import { PERMISSIONS } from "@/server/rbac/permissions";
import { PAYMENT_METHODS } from "@/server/modules/payments/payment.service";

export const EXPENSE_CATEGORIES = [
  "Electricity",
  "Water",
  "Cleaning supplies",
  "Repairs",
  "Maintenance",
  "Staff payments",
  "Laundry",
  "Food/supplies",
  "Internet",
  "Other",
] as const;

function toNumber(value: { toString(): string } | number | null | undefined): number {
  if (value == null) return 0;
  return typeof value === "number" ? value : Number(value);
}

function serializeExpense(e: {
  id: string;
  category: string;
  amount: { toString(): string };
  description: string;
  paymentMethod: string | null;
  reference: string | null;
  notes: string | null;
  incurredAt: Date;
  recordedAt: Date;
  recordedById: string | null;
  updatedAt: Date;
}) {
  return {
    id: e.id,
    category: e.category,
    amount: toNumber(e.amount),
    description: e.description,
    paymentMethod: e.paymentMethod,
    reference: e.reference,
    notes: e.notes,
    date: e.incurredAt.toISOString(),
    incurredAt: e.incurredAt.toISOString(),
    recordedAt: e.recordedAt.toISOString(),
    recordedById: e.recordedById,
    updatedAt: e.updatedAt.toISOString(),
  };
}

export async function listExpenses(actor: SessionUser, from?: Date, to?: Date) {
  assertPermission(actor, PERMISSIONS.FINANCE_VIEW);
  const where =
    from || to
      ? {
          incurredAt: {
            ...(from ? { gte: from } : {}),
            ...(to ? { lte: to } : {}),
          },
        }
      : undefined;

  const expenses = await prisma.expense.findMany({
    where,
    orderBy: { incurredAt: "desc" },
    take: 500,
  });
  return expenses.map(serializeExpense);
}

export async function createExpense(
  actor: SessionUser,
  input: {
    date: Date;
    category: string;
    description: string;
    amount: number;
    paymentMethod?: string;
    reference?: string;
    notes?: string;
  },
) {
  assertPermission(actor, PERMISSIONS.FINANCE_MANAGE);
  if (input.amount <= 0) throw new ValidationError("Expense amount must be greater than zero.");
  const category = input.category.trim();
  if (!category) throw new ValidationError("Category is required.");
  if (!input.description.trim()) throw new ValidationError("Description is required.");
  if (input.paymentMethod && !PAYMENT_METHODS.includes(input.paymentMethod as (typeof PAYMENT_METHODS)[number])) {
    throw new ValidationError("Invalid payment method.");
  }

  const expense = await prisma.expense.create({
    data: {
      category,
      description: input.description.trim(),
      amount: input.amount,
      incurredAt: input.date,
      paymentMethod: input.paymentMethod?.trim() || null,
      reference: input.reference?.trim() || null,
      notes: input.notes?.trim() || null,
      recordedById: actor.id,
    },
  });

  await writeAuditLog({
    userId: actor.id,
    action: "expense.created",
    resourceType: "expense",
    resourceId: expense.id,
    result: "SUCCESS",
    metadata: { category, amount: input.amount },
  });

  return serializeExpense(expense);
}

export async function updateExpense(
  actor: SessionUser,
  expenseId: string,
  input: {
    date?: Date;
    category?: string;
    description?: string;
    amount?: number;
    paymentMethod?: string;
    reference?: string;
    notes?: string;
  },
) {
  assertPermission(actor, PERMISSIONS.FINANCE_MANAGE);
  const existing = await prisma.expense.findUnique({ where: { id: expenseId } });
  if (!existing) throw new NotFoundError();
  if (input.amount !== undefined && input.amount <= 0) {
    throw new ValidationError("Expense amount must be greater than zero.");
  }
  if (input.paymentMethod && !PAYMENT_METHODS.includes(input.paymentMethod as (typeof PAYMENT_METHODS)[number])) {
    throw new ValidationError("Invalid payment method.");
  }

  const expense = await prisma.expense.update({
    where: { id: expenseId },
    data: {
      category: input.category?.trim() ?? existing.category,
      description: input.description?.trim() ?? existing.description,
      amount: input.amount ?? existing.amount,
      incurredAt: input.date ?? existing.incurredAt,
      paymentMethod: input.paymentMethod !== undefined ? input.paymentMethod.trim() || null : existing.paymentMethod,
      reference: input.reference !== undefined ? input.reference.trim() || null : existing.reference,
      notes: input.notes !== undefined ? input.notes.trim() || null : existing.notes,
    },
  });

  await writeAuditLog({
    userId: actor.id,
    action: "expense.updated",
    resourceType: "expense",
    resourceId: expenseId,
    result: "SUCCESS",
    metadata: { category: expense.category },
  });

  return serializeExpense(expense);
}
