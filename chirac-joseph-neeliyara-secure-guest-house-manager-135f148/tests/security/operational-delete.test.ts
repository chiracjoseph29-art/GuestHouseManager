import "dotenv/config";
import { randomUUID } from "crypto";
import { describe, expect, it } from "vitest";
import { prisma } from "@/server/db/prisma";
import { createBooking, deleteBookingPermanent } from "@/server/modules/bookings/booking.service";
import { createGuest, deleteGuestPermanent } from "@/server/modules/guests/guest.service";
import { createRoom, deleteRoomPermanent } from "@/server/modules/rooms/room.service";
import { ConflictError, ForbiddenError } from "@/server/lib/errors";

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

const manager = {
  id: "00000000-0000-0000-0000-000000000003",
  email: "manager@guesthouse.local",
  name: "Manager",
  role: "MANAGER" as const,
  status: "ACTIVE" as const,
  canViewFinancials: true,
  mfaEnabled: false,
};

const cleaner = {
  id: "00000000-0000-0000-0000-000000000002",
  email: "cleaner@guesthouse.local",
  name: "Cleaner",
  role: "CLEANER" as const,
  status: "ACTIVE" as const,
  canViewFinancials: false,
  mfaEnabled: false,
};

describe("operational delete — bookings", () => {
  it("admin can delete an unused booking and keeps the customer", async () => {
    const admin = await adminSession();
    const room = await prisma.room.findFirst({ where: { isActive: true } });
    if (!room) return;
    const phone = `3${Date.now().toString().slice(-9)}`;
    const guest = await createGuest(admin, { fullName: "Delete Booking Guest", phone });
    const { id: bookingId } = await createBooking(
      {
        guestId: guest.id,
        guest: { fullName: guest.fullName, phone },
        checkIn: new Date("2027-01-10T14:00:00Z"),
        checkOut: new Date("2027-01-11T11:00:00Z"),
        guestCount: 1,
        source: "DIRECT",
        isWholeHouse: false,
        roomIds: [room.id],
      },
      admin,
    );

    const result = await deleteBookingPermanent(bookingId, admin);
    expect(result.guestId).toBe(guest.id);
    expect(await prisma.booking.findUnique({ where: { id: bookingId } })).toBeNull();
    expect(await prisma.guest.findUnique({ where: { id: guest.id } })).toBeTruthy();

    const audit = await prisma.auditLog.findFirst({
      where: { action: "booking.deleted", resourceId: bookingId },
      orderBy: { createdAt: "desc" },
    });
    expect(audit).toBeTruthy();
  });

  it("manager and cleaner cannot permanently delete bookings", async () => {
    const booking = await prisma.booking.findFirst();
    if (!booking) return;
    await expect(deleteBookingPermanent(booking.id, manager)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(deleteBookingPermanent(booking.id, cleaner)).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("operational delete — customers", () => {
  it("admin can delete a customer with no bookings", async () => {
    const admin = await adminSession();
    const guest = await createGuest(admin, {
      fullName: "Orphan Customer",
      phone: `2${Date.now().toString().slice(-9)}`,
    });
    await deleteGuestPermanent(admin, guest.id);
    expect(await prisma.guest.findUnique({ where: { id: guest.id } })).toBeNull();
    const audit = await prisma.auditLog.findFirst({
      where: { action: "customer.deleted", resourceId: guest.id },
      orderBy: { createdAt: "desc" },
    });
    expect(audit).toBeTruthy();
  });

  it("cannot delete customer with bookings", async () => {
    const admin = await adminSession();
    const room = await prisma.room.findFirst({ where: { isActive: true } });
    if (!room) return;
    const phone = `1${Date.now().toString().slice(-9)}`;
    const guest = await createGuest(admin, { fullName: "Has Booking", phone });
    const checkIn = new Date();
    checkIn.setUTCDate(checkIn.getUTCDate() + 500 + (Date.now() % 100));
    checkIn.setUTCHours(14, 0, 0, 0);
    const checkOut = new Date(checkIn);
    checkOut.setUTCDate(checkOut.getUTCDate() + 1);
    checkOut.setUTCHours(11, 0, 0, 0);
    await createBooking(
      {
        guestId: guest.id,
        guest: { fullName: guest.fullName, phone },
        checkIn,
        checkOut,
        guestCount: 1,
        source: "DIRECT",
        isWholeHouse: false,
        roomIds: [room.id],
      },
      admin,
    );
    await expect(deleteGuestPermanent(admin, guest.id)).rejects.toBeInstanceOf(ConflictError);
    expect(await prisma.guest.findUnique({ where: { id: guest.id } })).toBeTruthy();
  });
});

describe("operational delete — rooms", () => {
  it("admin can delete an unused room and keeps room type", async () => {
    const admin = await adminSession();
    const roomType = await prisma.roomType.findFirst();
    if (!roomType) return;
    const room = await createRoom(admin, {
      name: `Del-${randomUUID().slice(0, 8)}`,
      roomTypeId: roomType.id,
      isActive: true,
    });
    const roomTypeId = room.roomTypeId;
    await deleteRoomPermanent(admin, room.id);
    expect(await prisma.room.findUnique({ where: { id: room.id } })).toBeNull();
    expect(await prisma.roomType.findUnique({ where: { id: roomTypeId } })).toBeTruthy();
    const audit = await prisma.auditLog.findFirst({
      where: { action: "room.deleted", resourceId: room.id },
      orderBy: { createdAt: "desc" },
    });
    expect(audit).toBeTruthy();
  });

  it("cannot delete room with booking links", async () => {
    const admin = await adminSession();
    const link = await prisma.bookingRoom.findFirst({ include: { room: true } });
    if (!link) return;
    await expect(deleteRoomPermanent(admin, link.roomId)).rejects.toBeInstanceOf(ConflictError);
    expect(await prisma.room.findUnique({ where: { id: link.roomId } })).toBeTruthy();
  });

  it("admin can delete a room with only PENDING cleaning tasks", async () => {
    const admin = await adminSession();
    const roomType = await prisma.roomType.findFirst();
    if (!roomType) return;
    const room = await createRoom(admin, {
      name: `Del-Pend-${randomUUID().slice(0, 8)}`,
      roomTypeId: roomType.id,
      isActive: true,
    });
    await prisma.cleaningTask.create({
      data: { roomId: room.id, status: "PENDING", dueAt: new Date() },
    });
    await deleteRoomPermanent(admin, room.id);
    expect(await prisma.room.findUnique({ where: { id: room.id } })).toBeNull();
    expect(await prisma.cleaningTask.count({ where: { roomId: room.id } })).toBe(0);
  });

  it("admin can delete a room with only IN_PROGRESS cleaning tasks", async () => {
    const admin = await adminSession();
    const roomType = await prisma.roomType.findFirst();
    if (!roomType) return;
    const room = await createRoom(admin, {
      name: `Del-Prog-${randomUUID().slice(0, 8)}`,
      roomTypeId: roomType.id,
      isActive: true,
    });
    await prisma.cleaningTask.create({
      data: {
        roomId: room.id,
        status: "IN_PROGRESS",
        dueAt: new Date(),
        startedAt: new Date(),
      },
    });
    await deleteRoomPermanent(admin, room.id);
    expect(await prisma.room.findUnique({ where: { id: room.id } })).toBeNull();
  });

  it("cannot delete room with COMPLETED cleaning history", async () => {
    const admin = await adminSession();
    const roomType = await prisma.roomType.findFirst();
    if (!roomType) return;
    const room = await createRoom(admin, {
      name: `Del-Done-${randomUUID().slice(0, 8)}`,
      roomTypeId: roomType.id,
      isActive: true,
    });
    await prisma.cleaningTask.create({
      data: {
        roomId: room.id,
        status: "COMPLETED",
        dueAt: new Date(),
        completedAt: new Date(),
      },
    });
    await expect(deleteRoomPermanent(admin, room.id)).rejects.toMatchObject({
      message: expect.stringContaining("completed cleaning history"),
    });
    expect(await prisma.room.findUnique({ where: { id: room.id } })).toBeTruthy();
    await prisma.cleaningTask.deleteMany({ where: { roomId: room.id } });
    await prisma.room.delete({ where: { id: room.id } });
  });

  it("manager cannot permanently delete rooms", async () => {
    const mgr = await prisma.user.findFirst({ where: { role: "MANAGER" } });
    const roomType = await prisma.roomType.findFirst();
    if (!mgr || !roomType) return;
    const room = await createRoom(await adminSession(), {
      name: `Del-Mgr-${randomUUID().slice(0, 8)}`,
      roomTypeId: roomType.id,
    });
    await expect(
      deleteRoomPermanent(
        {
          id: mgr.id,
          email: mgr.email,
          name: mgr.name,
          role: "MANAGER",
          status: "ACTIVE",
          canViewFinancials: mgr.canViewFinancials,
          mfaEnabled: mgr.mfaEnabled,
        },
        room.id,
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await prisma.room.delete({ where: { id: room.id } });
  });

  it("room delete does not remove expenses or unrelated bookings", async () => {
    const admin = await adminSession();
    const roomType = await prisma.roomType.findFirst();
    if (!roomType) return;
    const expenseCountBefore = await prisma.expense.count();
    const bookingCountBefore = await prisma.booking.count();
    const guestCountBefore = await prisma.guest.count();
    const paymentCountBefore = await prisma.payment.count();

    const room = await createRoom(admin, {
      name: `Del-Fin-${randomUUID().slice(0, 8)}`,
      roomTypeId: roomType.id,
    });
    await prisma.cleaningTask.create({
      data: { roomId: room.id, status: "PENDING", dueAt: new Date() },
    });
    await deleteRoomPermanent(admin, room.id);

    expect(await prisma.expense.count()).toBe(expenseCountBefore);
    expect(await prisma.booking.count()).toBe(bookingCountBefore);
    expect(await prisma.guest.count()).toBe(guestCountBefore);
    expect(await prisma.payment.count()).toBe(paymentCountBefore);
  });
});
