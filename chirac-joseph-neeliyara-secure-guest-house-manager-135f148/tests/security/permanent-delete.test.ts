import "dotenv/config";
import { randomUUID } from "crypto";
import { describe, expect, it } from "vitest";
import { prisma } from "@/server/db/prisma";
import { deleteBookingPermanent } from "@/server/modules/bookings/booking.service";
import { deleteCleaningTaskPermanent } from "@/server/modules/cleaning/cleaning.service";
import { createExpense, deleteExpensePermanent } from "@/server/modules/finance/expense.service";
import { createRoom, deleteRoomPermanent } from "@/server/modules/rooms/room.service";
import { assertPermission, roleHasPermission } from "@/server/rbac/authorize";
import { PERMISSIONS } from "@/server/rbac/permissions";
import { ForbiddenError } from "@/server/lib/errors";

async function adminSession() {
  const user = await prisma.user.findFirst({ where: { role: "ADMIN" } });
  expect(user).toBeTruthy();
  return {
    id: user!.id,
    email: user!.email,
    name: user!.name,
    role: "ADMIN" as const,
    status: "ACTIVE" as const,
    canViewFinancials: true,
    mfaEnabled: false,
  };
}

function managerSession(canViewFinancials = true) {
  return {
    id: "00000000-0000-0000-0000-000000000003",
    email: "manager@guesthouse.local",
    name: "Manager",
    role: "MANAGER" as const,
    status: "ACTIVE" as const,
    canViewFinancials,
    mfaEnabled: false,
  };
}

const cleaner = {
  id: "00000000-0000-0000-0000-000000000002",
  email: "cleaner@guesthouse.local",
  name: "Cleaner",
  role: "CLEANER" as const,
  status: "ACTIVE" as const,
  canViewFinancials: false,
  mfaEnabled: false,
};

const PERMANENT_DELETE_PERMS = [
  PERMISSIONS.BOOKINGS_DELETE_PERMANENT,
  PERMISSIONS.ROOMS_DELETE_PERMANENT,
  PERMISSIONS.CLEANING_DELETE_PERMANENT,
  PERMISSIONS.EXPENSES_DELETE_PERMANENT,
] as const;

describe("permanent delete permissions", () => {
  it("ADMIN has all permanent-delete permissions", () => {
    for (const code of PERMANENT_DELETE_PERMS) {
      expect(roleHasPermission("ADMIN", code)).toBe(true);
      expect(() => assertPermission({ role: "ADMIN", canViewFinancials: true }, code)).not.toThrow();
    }
  });

  it("MANAGER and CLEANER lack permanent-delete permissions", () => {
    for (const code of PERMANENT_DELETE_PERMS) {
      expect(roleHasPermission("MANAGER", code)).toBe(false);
      expect(roleHasPermission("CLEANER", code)).toBe(false);
      expect(() => assertPermission(managerSession(), code)).toThrow(ForbiddenError);
      expect(() => assertPermission(cleaner, code)).toThrow(ForbiddenError);
    }
  });

  it("ADMIN retains cleaner operational permissions", () => {
    expect(() => assertPermission({ role: "ADMIN", canViewFinancials: true }, PERMISSIONS.CLEANING_EXECUTE)).not.toThrow();
    expect(() => assertPermission({ role: "ADMIN", canViewFinancials: true }, PERMISSIONS.INVENTORY_VERIFY)).not.toThrow();
  });
});

describe("expense permanent delete", () => {
  it("admin can delete expense and writes audit without touching bookings", async () => {
    const admin = await adminSession();
    const bookingCountBefore = await prisma.booking.count();
    const paymentCountBefore = await prisma.payment.count();
    const created = await createExpense(admin, {
      date: new Date(),
      category: "Other",
      description: `Disposable expense ${randomUUID().slice(0, 8)}`,
      amount: 42,
      paymentMethod: "CASH",
    });
    await deleteExpensePermanent(admin, created.id);
    expect(await prisma.expense.findUnique({ where: { id: created.id } })).toBeNull();
    expect(await prisma.booking.count()).toBe(bookingCountBefore);
    expect(await prisma.payment.count()).toBe(paymentCountBefore);
    const audit = await prisma.auditLog.findFirst({
      where: { action: "expense.deleted", resourceId: created.id },
      orderBy: { createdAt: "desc" },
    });
    expect(audit).toBeTruthy();
  });

  it("manager and cleaner cannot delete expenses", async () => {
    const expense = await prisma.expense.findFirst();
    if (!expense) return;
    await expect(deleteExpensePermanent(managerSession(), expense.id)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(deleteExpensePermanent(cleaner, expense.id)).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("cleaning permanent delete", () => {
  it("admin can delete a pending task and audit event", async () => {
    const admin = await adminSession();
    const room = await prisma.room.findFirst({ where: { isActive: true } });
    if (!room) return;
    const task = await prisma.cleaningTask.create({
      data: { roomId: room.id, status: "PENDING", dueAt: new Date() },
    });
    const roomCountBefore = await prisma.room.count();
    await deleteCleaningTaskPermanent(admin, task.id);
    expect(await prisma.cleaningTask.findUnique({ where: { id: task.id } })).toBeNull();
    expect(await prisma.room.count()).toBe(roomCountBefore);
    const audit = await prisma.auditLog.findFirst({
      where: { action: "cleaning.deleted", resourceId: task.id },
      orderBy: { createdAt: "desc" },
    });
    expect(audit).toBeTruthy();
  });

  it("manager and cleaner cannot permanently delete cleaning tasks", async () => {
    const task = await prisma.cleaningTask.findFirst();
    if (!task) return;
    await expect(deleteCleaningTaskPermanent(managerSession(), task.id)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(deleteCleaningTaskPermanent(cleaner, task.id)).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("booking and room permanent delete RBAC", () => {
  it("manager cannot permanently delete bookings", async () => {
    const booking = await prisma.booking.findFirst();
    if (!booking) return;
    await expect(deleteBookingPermanent(booking.id, managerSession())).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("manager cannot permanently delete rooms", async () => {
    const room = await prisma.room.findFirst();
    if (!room) return;
    await expect(deleteRoomPermanent(managerSession(), room.id)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("admin can delete disposable room with pending cleaning", async () => {
    const admin = await adminSession();
    const roomType = await prisma.roomType.findFirst();
    if (!roomType) return;
    const room = await createRoom(admin, {
      name: `Perm-${randomUUID().slice(0, 8)}`,
      roomTypeId: roomType.id,
    });
    await prisma.cleaningTask.create({
      data: { roomId: room.id, status: "PENDING", dueAt: new Date() },
    });
    await deleteRoomPermanent(admin, room.id);
    expect(await prisma.room.findUnique({ where: { id: room.id } })).toBeNull();
  });
});
