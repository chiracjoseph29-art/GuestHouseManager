import { prisma } from "@/server/db/prisma";
import type { SessionUser } from "@/server/modules/auth/session.service";
import { assertPermission, roleHasPermission } from "@/server/rbac/authorize";
import { PERMISSIONS } from "@/server/rbac/permissions";
import { resolvePeriodRange } from "@/server/modules/finance/finance.service";

function toNumber(value: { toString(): string } | number | null | undefined): number {
  if (value == null) return 0;
  return typeof value === "number" ? value : Number(value);
}

function dayBounds() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

export async function getOperationsOverview(user: SessionUser) {
  const { start: todayStart, end: todayEnd } = dayBounds();
  const monthRange = resolvePeriodRange("month");

  const canBookings = roleHasPermission(user.role, PERMISSIONS.BOOKINGS_VIEW) || user.role === "ADMIN";
  const canCleaning =
    roleHasPermission(user.role, PERMISSIONS.CLEANING_VIEW) ||
    roleHasPermission(user.role, PERMISSIONS.CLEANING_EXECUTE) ||
    user.role === "ADMIN";
  const canFinance =
    user.role === "ADMIN" ||
    (user.role === "MANAGER" && user.canViewFinancials && roleHasPermission(user.role, PERMISSIONS.FINANCE_VIEW));
  const canInventory =
    roleHasPermission(user.role, PERMISSIONS.INVENTORY_VIEW) ||
    roleHasPermission(user.role, PERMISSIONS.INVENTORY_VERIFY) ||
    user.role === "ADMIN";

  const result: Record<string, unknown> = { role: user.role };

  if (canBookings) {
    const [
      bookingsToday,
      checkInsToday,
      checkOutsToday,
      occupiedRooms,
      activeRooms,
      recentBookings,
    ] = await Promise.all([
      prisma.booking.count({
        where: {
          createdAt: { gte: todayStart, lte: todayEnd },
          status: { notIn: ["CANCELLED"] },
        },
      }),
      prisma.booking.count({
        where: {
          checkIn: { gte: todayStart, lte: todayEnd },
          status: { in: ["PENDING", "CONFIRMED", "CHECKED_IN"] },
        },
      }),
      prisma.booking.count({
        where: {
          checkOut: { gte: todayStart, lte: todayEnd },
          status: { in: ["CONFIRMED", "CHECKED_IN", "CHECKED_OUT"] },
        },
      }),
      prisma.bookingRoom.count({
        where: { booking: { status: "CHECKED_IN" } },
      }),
      prisma.room.count({ where: { isActive: true } }),
      prisma.booking.findMany({
        orderBy: { createdAt: "desc" },
        take: 5,
        select: {
          id: true,
          reference: true,
          status: true,
          checkIn: true,
          guest: { select: { fullName: true } },
        },
      }),
    ]);
    result.bookings = {
      todayCount: bookingsToday,
      checkInsToday,
      checkOutsToday,
      occupiedRooms,
      availableRooms: Math.max(0, activeRooms - occupiedRooms),
      recent: recentBookings.map((b) => ({
        id: b.id,
        reference: b.reference,
        status: b.status,
        checkIn: b.checkIn.toISOString(),
        guestName: b.guest.fullName,
      })),
    };
  }

  if (canCleaning) {
    const [needsCleaning, awaitingVerification, completedToday, recentCleaning] = await Promise.all([
      prisma.cleaningTask.count({
        where: { status: { in: ["PENDING", "IN_PROGRESS", "ISSUE_REPORTED"] } },
      }),
      prisma.cleaningTask.count({ where: { status: "AWAITING_VERIFICATION" } }),
      prisma.cleaningTask.count({
        where: {
          status: "COMPLETED",
          OR: [
            { verifiedAt: { gte: todayStart, lte: todayEnd } },
            { completedAt: { gte: todayStart, lte: todayEnd } },
          ],
        },
      }),
      prisma.cleaningTask.findMany({
        orderBy: { updatedAt: "desc" },
        take: 5,
        select: {
          id: true,
          status: true,
          updatedAt: true,
          room: { select: { name: true } },
          assignedTo: { select: { name: true } },
        },
      }),
    ]);
    result.cleaning = {
      roomsNeedingCleaning: needsCleaning,
      awaitingVerification,
      completedToday,
      recent: recentCleaning.map((t) => ({
        id: t.id,
        status: t.status,
        roomName: t.room.name,
        assignee: t.assignedTo?.name ?? null,
        updatedAt: t.updatedAt.toISOString(),
      })),
    };
  }

  if (canFinance) {
    try {
      assertPermission(user, PERMISSIONS.FINANCE_VIEW);
    } catch {
      /* manager without financials */
    }
    if (user.role === "ADMIN" || (user.role === "MANAGER" && user.canViewFinancials)) {
      const [todayIncome, monthIncome, monthExpenses, outstanding, recentPayments] = await Promise.all([
        prisma.payment.aggregate({
          where: { recordedAt: { gte: todayStart, lte: todayEnd } },
          _sum: { amount: true },
        }),
        prisma.payment.aggregate({
          where: { recordedAt: { gte: monthRange.from, lte: monthRange.to } },
          _sum: { amount: true },
        }),
        prisma.expense.aggregate({
          where: { incurredAt: { gte: monthRange.from, lte: monthRange.to } },
          _sum: { amount: true },
        }),
        prisma.booking.aggregate({
          where: { status: { notIn: ["CANCELLED"] }, balance: { gt: 0 } },
          _sum: { balance: true },
        }),
        prisma.payment.findMany({
          orderBy: { recordedAt: "desc" },
          take: 5,
          include: { booking: { select: { reference: true, guest: { select: { fullName: true } } } } },
        }),
      ]);
      const monthInc = toNumber(monthIncome._sum.amount);
      const monthExp = toNumber(monthExpenses._sum.amount);
      result.finance = {
        todayRevenue: toNumber(todayIncome._sum.amount),
        monthRevenue: monthInc,
        monthExpenses: monthExp,
        netCashFlowMonth: monthInc - monthExp,
        outstandingBalance: toNumber(outstanding._sum.balance),
        recentPayments: recentPayments.map((p) => ({
          id: p.id,
          amount: toNumber(p.amount),
          recordedAt: p.recordedAt.toISOString(),
          bookingReference: p.booking.reference,
          guestName: p.booking.guest.fullName,
        })),
      };
    }
  }

  if (canInventory) {
    const [items, openDiscrepancies] = await Promise.all([
      prisma.inventoryItem.findMany({
        select: { quantity: true, minimumThreshold: true },
      }),
      prisma.inventoryVerification.count({ where: { discrepancyStatus: "OPEN" } }),
    ]);
    const needsAttention = items.filter((i) => i.quantity <= i.minimumThreshold).length;
    result.inventory = {
      itemsNeedingAttention: needsAttention,
      openDiscrepancies,
    };
  }

  return result;
}
