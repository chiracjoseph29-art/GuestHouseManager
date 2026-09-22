import { prisma } from "@/server/db/prisma";
import { jsonOk, withAuth } from "@/server/http/api-handler";
import { PERMISSIONS } from "@/server/rbac/permissions";
import { assertPermission } from "@/server/rbac/authorize";

export const GET = withAuth(PERMISSIONS.REPORTS_VIEW, async ({ user, correlationId }) => {
  assertPermission(user, PERMISSIONS.FINANCE_VIEW);
  const [paymentSum, expenseSum, bookingCount] = await Promise.all([
    prisma.payment.aggregate({ _sum: { amount: true } }),
    prisma.expense.aggregate({ _sum: { amount: true } }),
    prisma.booking.count({ where: { status: { not: "CANCELLED" } } }),
  ]);
  return jsonOk(
    {
      totalPayments: paymentSum._sum.amount ?? 0,
      totalExpenses: expenseSum._sum.amount ?? 0,
      activeBookings: bookingCount,
    },
    correlationId,
  );
});
