import "dotenv/config";
import { describe, expect, it } from "vitest";
import { prisma } from "@/server/db/prisma";
import { recordPayment } from "@/server/modules/payments/payment.service";
import { createRoom, updateRoom } from "@/server/modules/rooms/room.service";
import { ForbiddenError, ValidationError } from "@/server/lib/errors";
import { createBooking } from "@/server/modules/bookings/booking.service";

const admin = {
  id: "00000000-0000-0000-0000-000000000001",
  email: "admin@guesthouse.local",
  name: "Admin",
  role: "ADMIN" as const,
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

describe("payments", () => {
  it("rejects negative payment amount", async () => {
    const booking = await prisma.booking.findFirst();
    if (!booking) return;
    await expect(
      recordPayment(admin, { bookingId: booking.id, amount: -1, method: "CASH" }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("cleaner cannot record payments", async () => {
    const booking = await prisma.booking.findFirst();
    if (!booking) return;
    await expect(
      recordPayment(cleaner, { bookingId: booking.id, amount: 1, method: "CASH" }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("rooms", () => {
  it("creates and renames a room", async () => {
    const types = await prisma.roomType.findMany({ take: 1 });
    if (!types[0]) return;
    const name = `Test Room ${Date.now()}`;
    const room = await createRoom(admin, { name, roomTypeId: types[0].id });
    const updated = await updateRoom(admin, room.id, { name: `${name} Deluxe` });
    expect(updated.name).toContain("Deluxe");
  });

  it("prevents booking inactive room", async () => {
    const room = await prisma.room.findFirst({ where: { isActive: true } });
    if (!room) return;
    await updateRoom(admin, room.id, { isActive: false });
    const checkIn = new Date();
    checkIn.setFullYear(checkIn.getFullYear() + 3);
    const checkOut = new Date(checkIn);
    checkOut.setDate(checkOut.getDate() + 1);
    await expect(
      createBooking(
        {
          guest: { fullName: "Inactive Room Guest", phone: `3${Date.now().toString().slice(-9)}` },
          checkIn,
          checkOut,
          guestCount: 1,
          source: "DIRECT",
          isWholeHouse: false,
          roomIds: [room.id],
        },
        admin,
      ),
    ).rejects.toBeInstanceOf(ValidationError);
    await updateRoom(admin, room.id, { isActive: true });
  });
});
