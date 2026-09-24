import { prisma } from "@/server/db/prisma";
import { NotFoundError, ValidationError } from "@/server/lib/errors";
import { writeAuditLog } from "@/server/modules/audit/audit.service";
import type { PaymentStatus } from "@/generated/prisma/client";
import type { SessionUser } from "@/server/modules/auth/session.service";
import { assertPermission } from "@/server/rbac/authorize";
import { PERMISSIONS } from "@/server/rbac/permissions";

export const PAYMENT_METHODS = ["CASH", "UPI", "CARD", "BANK_TRANSFER", "OTHER"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

function toNumber(value: { toString(): string } | number): number {
  return typeof value === "number" ? value : Number(value);
}

export async function syncBookingPaymentTotals(bookingId: string) {
  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!booking) throw new NotFoundError();

  const payments = await prisma.payment.findMany({ where: { bookingId } });
  const amountPaid = payments.reduce((sum, p) => sum + toNumber(p.amount), 0);
  const amountTotal = toNumber(booking.amountTotal);
  const balance = Math.max(0, amountTotal - amountPaid);

  let paymentStatus: PaymentStatus = "UNPAID";
  if (amountPaid <= 0) paymentStatus = "UNPAID";
  else if (amountPaid >= amountTotal) paymentStatus = "PAID";
  else paymentStatus = "PARTIAL";

  await prisma.booking.update({
    where: { id: bookingId },
    data: { amountPaid, balance, paymentStatus },
  });

  return { amountTotal, amountPaid, balance, paymentStatus };
}

export async function listPayments(actor: SessionUser, bookingId?: string) {
  assertPermission(actor, PERMISSIONS.FINANCE_VIEW);
  const payments = await prisma.payment.findMany({
    where: bookingId ? { bookingId } : undefined,
    orderBy: { recordedAt: "desc" },
    include: {
      booking: {
        select: {
          id: true,
          reference: true,
          guest: { select: { fullName: true } },
          amountTotal: true,
          amountPaid: true,
          balance: true,
          paymentStatus: true,
        },
      },
    },
    take: 500,
  });

  const summary = await prisma.payment.aggregate({ _sum: { amount: true } });
  const outstanding = await prisma.booking.aggregate({
    where: { status: { notIn: ["CANCELLED"] }, balance: { gt: 0 } },
    _sum: { balance: true },
  });

  return {
    payments,
    summary: {
      totalCollected: toNumber(summary._sum.amount ?? 0),
      outstandingBalance: toNumber(outstanding._sum.balance ?? 0),
    },
  };
}

export async function recordPayment(
  actor: SessionUser,
  input: {
    bookingId: string;
    amount: number;
    method: string;
    reference?: string;
    notes?: string;
    recordedAt?: Date;
  },
) {
  assertPermission(actor, PERMISSIONS.FINANCE_MANAGE);
  if (input.amount <= 0) throw new ValidationError("Payment amount must be greater than zero.");
  if (!PAYMENT_METHODS.includes(input.method as PaymentMethod)) {
    throw new ValidationError("Invalid payment method.");
  }

  const booking = await prisma.booking.findUnique({ where: { id: input.bookingId } });
  if (!booking) throw new NotFoundError();
  if (booking.status === "CANCELLED") throw new ValidationError("Cannot record payment on a cancelled booking.");

  const currentPaid = toNumber(booking.amountPaid);
  const total = toNumber(booking.amountTotal);
  if (currentPaid + input.amount > total) {
    throw new ValidationError("Payment would exceed the booking total.");
  }

  const payment = await prisma.payment.create({
    data: {
      bookingId: input.bookingId,
      amount: input.amount,
      method: input.method,
      reference: input.reference?.trim(),
      notes: input.notes?.trim(),
      recordedAt: input.recordedAt ?? new Date(),
      recordedById: actor.id,
    },
  });

  await syncBookingPaymentTotals(input.bookingId);

  await writeAuditLog({
    userId: actor.id,
    action: "payment.created",
    resourceType: "payment",
    resourceId: payment.id,
    result: "SUCCESS",
    metadata: { bookingId: input.bookingId, amount: input.amount, method: input.method },
  });

  return payment;
}

export async function updatePayment(
  actor: SessionUser,
  paymentId: string,
  input: {
    amount?: number;
    method?: string;
    reference?: string;
    notes?: string;
    recordedAt?: Date;
  },
) {
  assertPermission(actor, PERMISSIONS.FINANCE_MANAGE);
  const existing = await prisma.payment.findUnique({ where: { id: paymentId } });
  if (!existing) throw new NotFoundError();

  const amount = input.amount ?? toNumber(existing.amount);
  if (amount <= 0) throw new ValidationError("Payment amount must be greater than zero.");
  const method = input.method ?? existing.method;
  if (!PAYMENT_METHODS.includes(method as PaymentMethod)) {
    throw new ValidationError("Invalid payment method.");
  }

  const booking = await prisma.booking.findUnique({ where: { id: existing.bookingId } });
  if (!booking) throw new NotFoundError();

  const otherPaid = (
    await prisma.payment.findMany({
      where: { bookingId: existing.bookingId, id: { not: paymentId } },
    })
  ).reduce((sum, p) => sum + toNumber(p.amount), 0);

  const total = toNumber(booking.amountTotal);
  if (otherPaid + amount > total) {
    throw new ValidationError("Payment would exceed the booking total.");
  }

  const payment = await prisma.payment.update({
    where: { id: paymentId },
    data: {
      amount,
      method,
      reference: input.reference !== undefined ? input.reference.trim() || null : existing.reference,
      notes: input.notes !== undefined ? input.notes.trim() || null : existing.notes,
      recordedAt: input.recordedAt ?? existing.recordedAt,
    },
  });

  await syncBookingPaymentTotals(existing.bookingId);

  await writeAuditLog({
    userId: actor.id,
    action: "payment.updated",
    resourceType: "payment",
    resourceId: paymentId,
    result: "SUCCESS",
    metadata: { bookingId: existing.bookingId },
  });

  return payment;
}
