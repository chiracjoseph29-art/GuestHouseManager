import {
  createExpense,
  deleteExpensePermanent,
  listExpenses,
  updateExpense,
} from "@/server/modules/finance/expense.service";
import { jsonOk, withAuth } from "@/server/http/api-handler";
import { PERMISSIONS } from "@/server/rbac/permissions";
import { ValidationError } from "@/server/lib/errors";
import { z } from "zod";
import { PAYMENT_METHODS } from "@/server/modules/payments/payment.service";

const expenseSchema = z.object({
  date: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}/)),
  category: z.string().min(1).max(100),
  description: z.string().min(1).max(5000),
  amount: z.number().positive(),
  paymentMethod: z.enum(PAYMENT_METHODS).optional(),
  reference: z.string().max(100).optional(),
  notes: z.string().max(5000).optional(),
});

function parseDate(value: string): Date {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw new ValidationError("Invalid date.");
  return d;
}

export const GET = withAuth(PERMISSIONS.FINANCE_VIEW, async ({ req, user, correlationId }) => {
  const url = new URL(req.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const expenses = await listExpenses(
    user,
    from ? parseDate(from) : undefined,
    to ? parseDate(to) : undefined,
  );
  return jsonOk({ expenses }, correlationId);
});

export const POST = withAuth(PERMISSIONS.FINANCE_MANAGE, async ({ req, user, correlationId }) => {
  const body = await req.json().catch(() => null);
  const parsed = expenseSchema.safeParse(body);
  if (!parsed.success) throw new ValidationError();
  const expense = await createExpense(user, {
    date: parseDate(parsed.data.date),
    category: parsed.data.category,
    description: parsed.data.description,
    amount: parsed.data.amount,
    paymentMethod: parsed.data.paymentMethod,
    reference: parsed.data.reference,
    notes: parsed.data.notes,
  });
  return jsonOk({ expense }, correlationId);
});

export const PUT = withAuth(PERMISSIONS.FINANCE_MANAGE, async ({ req, user, correlationId }) => {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) throw new ValidationError("id is required.");
  const body = await req.json().catch(() => null);
  const parsed = expenseSchema.partial().safeParse(body);
  if (!parsed.success) throw new ValidationError();
  const expense = await updateExpense(user, id, {
    date: parsed.data.date ? parseDate(parsed.data.date) : undefined,
    category: parsed.data.category,
    description: parsed.data.description,
    amount: parsed.data.amount,
    paymentMethod: parsed.data.paymentMethod,
    reference: parsed.data.reference,
    notes: parsed.data.notes,
  });
  return jsonOk({ expense }, correlationId);
});

export const DELETE = withAuth(PERMISSIONS.EXPENSES_DELETE_PERMANENT, async ({ req, user, correlationId }) => {
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) throw new ValidationError("id is required.");
  if (url.searchParams.get("permanent") !== "1") {
    throw new ValidationError("permanent=1 is required.");
  }
  const result = await deleteExpensePermanent(user, id);
  return jsonOk(result, correlationId);
});
