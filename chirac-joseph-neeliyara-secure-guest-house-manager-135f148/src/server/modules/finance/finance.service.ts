import { prisma } from "@/server/db/prisma";
import type { SessionUser } from "@/server/modules/auth/session.service";
import { assertPermission } from "@/server/rbac/authorize";
import { PERMISSIONS } from "@/server/rbac/permissions";

export type FinancePeriod = "today" | "week" | "month" | "last_month" | "custom";

function toNumber(value: { toString(): string } | number | null | undefined): number {
  if (value == null) return 0;
  return typeof value === "number" ? value : Number(value);
}

export function resolvePeriodRange(
  period: FinancePeriod,
  customFrom?: Date,
  customTo?: Date,
): { from: Date; to: Date; label: string } {
  const now = new Date();
  const startOfDay = (d: Date) => {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
  };
  const endOfDay = (d: Date) => {
    const x = new Date(d);
    x.setHours(23, 59, 59, 999);
    return x;
  };

  if (period === "custom" && customFrom && customTo) {
    return { from: startOfDay(customFrom), to: endOfDay(customTo), label: "Custom range" };
  }
  if (period === "today") {
    return { from: startOfDay(now), to: endOfDay(now), label: "Today" };
  }
  if (period === "week") {
    const from = startOfDay(now);
    from.setDate(from.getDate() - from.getDay());
    return { from, to: endOfDay(now), label: "This week" };
  }
  if (period === "last_month") {
    const from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const to = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
    return { from, to, label: "Last month" };
  }
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  return { from, to: endOfDay(now), label: "This month" };
}

export async function getFinancialOverview(
  actor: SessionUser,
  period: FinancePeriod,
  customFrom?: Date,
  customTo?: Date,
) {
  assertPermission(actor, PERMISSIONS.FINANCE_VIEW);

  const { from, to, label } = resolvePeriodRange(period, customFrom, customTo);
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);
  const monthStart = new Date(todayStart.getFullYear(), todayStart.getMonth(), 1);

  const [
    periodIncome,
    periodExpenses,
    todayIncome,
    todayExpenses,
    monthIncome,
    monthExpenses,
    expenseByCategory,
    outstanding,
    recentPayments,
    recentExpenses,
  ] = await Promise.all([
    prisma.payment.aggregate({
      where: { recordedAt: { gte: from, lte: to } },
      _sum: { amount: true },
    }),
    prisma.expense.aggregate({
      where: { incurredAt: { gte: from, lte: to } },
      _sum: { amount: true },
    }),
    prisma.payment.aggregate({
      where: { recordedAt: { gte: todayStart, lte: todayEnd } },
      _sum: { amount: true },
    }),
    prisma.expense.aggregate({
      where: { incurredAt: { gte: todayStart, lte: todayEnd } },
      _sum: { amount: true },
    }),
    prisma.payment.aggregate({
      where: { recordedAt: { gte: monthStart, lte: todayEnd } },
      _sum: { amount: true },
    }),
    prisma.expense.aggregate({
      where: { incurredAt: { gte: monthStart, lte: todayEnd } },
      _sum: { amount: true },
    }),
    prisma.expense.groupBy({
      by: ["category"],
      where: { incurredAt: { gte: from, lte: to } },
      _sum: { amount: true },
      orderBy: { category: "asc" },
    }),
    prisma.booking.aggregate({
      where: { status: { notIn: ["CANCELLED"] }, balance: { gt: 0 } },
      _sum: { balance: true },
    }),
    prisma.payment.findMany({
      where: { recordedAt: { gte: from, lte: to } },
      orderBy: { recordedAt: "desc" },
      take: 100,
      include: {
        booking: {
          select: {
            reference: true,
            guest: { select: { fullName: true } },
          },
        },
      },
    }),
    prisma.expense.findMany({
      where: { incurredAt: { gte: from, lte: to } },
      orderBy: { incurredAt: "desc" },
      take: 100,
    }),
  ]);

  const incomeTotal = toNumber(periodIncome._sum.amount);
  const expenseTotal = toNumber(periodExpenses._sum.amount);

  return {
    period: { key: period, label, from: from.toISOString(), to: to.toISOString() },
    summary: {
      income: incomeTotal,
      expenses: expenseTotal,
      net: incomeTotal - expenseTotal,
      todayIncome: toNumber(todayIncome._sum.amount),
      todayExpenses: toNumber(todayExpenses._sum.amount),
      monthIncome: toNumber(monthIncome._sum.amount),
      monthExpenses: toNumber(monthExpenses._sum.amount),
      outstandingBalance: toNumber(outstanding._sum.balance),
    },
    incomeBreakdown: [{ label: "Booking payments", amount: incomeTotal }],
    expenseBreakdown: expenseByCategory.map((row) => ({
      category: row.category,
      amount: toNumber(row._sum.amount),
    })),
    payments: recentPayments.map((p) => ({
      id: p.id,
      amount: toNumber(p.amount),
      method: p.method,
      reference: p.reference,
      recordedAt: p.recordedAt.toISOString(),
      bookingReference: p.booking.reference,
      guestName: p.booking.guest.fullName,
      bookingId: p.bookingId,
    })),
    expenses: recentExpenses.map((e) => ({
      id: e.id,
      category: e.category,
      amount: toNumber(e.amount),
      description: e.description,
      paymentMethod: e.paymentMethod,
      reference: e.reference,
      incurredAt: e.incurredAt.toISOString(),
    })),
  };
}
