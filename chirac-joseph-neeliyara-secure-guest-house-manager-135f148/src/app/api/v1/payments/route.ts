import { listPayments, recordPayment, updatePayment } from "@/server/modules/payments/payment.service";
import { jsonOk, withAuth } from "@/server/http/api-handler";
import { PERMISSIONS } from "@/server/rbac/permissions";
import { ValidationError } from "@/server/lib/errors";
import { z } from "zod";

const paymentSchema = z.object({
  bookingId: z.string().uuid(),
  amount: z.number().positive(),
  method: z.string().min(1).max(50),
  reference: z.string().max(100).optional(),
  notes: z.string().max(2000).optional(),
  recordedAt: z.string().datetime().optional(),
});

export const GET = withAuth(PERMISSIONS.FINANCE_VIEW, async ({ req, user, correlationId }) => {
  const bookingId = new URL(req.url).searchParams.get("bookingId") ?? undefined;
  const data = await listPayments(user, bookingId);
  return jsonOk(data, correlationId);
});

export const POST = withAuth(PERMISSIONS.FINANCE_MANAGE, async ({ req, user, correlationId }) => {
  const body = await req.json().catch(() => null);
  const parsed = paymentSchema.safeParse(body);
  if (!parsed.success) throw new ValidationError();
  const payment = await recordPayment(user, {
    ...parsed.data,
    recordedAt: parsed.data.recordedAt ? new Date(parsed.data.recordedAt) : undefined,
  });
  return jsonOk({ payment }, correlationId);
});

export const PATCH = withAuth(PERMISSIONS.FINANCE_MANAGE, async ({ req, user, correlationId }) => {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) throw new ValidationError("id is required.");
  const body = await req.json().catch(() => null);
  const schema = paymentSchema.partial().omit({ bookingId: true });
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new ValidationError();
  const payment = await updatePayment(user, id, {
    ...parsed.data,
    recordedAt: parsed.data.recordedAt ? new Date(parsed.data.recordedAt) : undefined,
  });
  return jsonOk({ payment }, correlationId);
});
