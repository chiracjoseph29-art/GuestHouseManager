import "dotenv/config";
import { describe, expect, it } from "vitest";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";
import { createBooking } from "@/server/modules/bookings/booking.service";
import { findGuestByNormalizedContact } from "@/server/modules/guests/guest.service";

async function adminUser() {
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

describe("booking create with existing guest", () => {
  it("Prisma client supports normalized guest contact fields", () => {
    const fields = Prisma.GuestScalarFieldEnum;
    expect(fields.phoneNormalized).toBe("phoneNormalized");
    expect(fields.emailNormalized).toBe("emailNormalized");
  });

  it("findGuestByNormalizedContact queries phoneNormalized without client errors", async () => {
    const guest = await prisma.guest.findFirst({
      where: { phone: { not: null }, anonymizedAt: null },
    });
    if (!guest?.phone) return;
    const match = await findGuestByNormalizedContact({
      phone: guest.phone,
      excludeGuestId: guest.id,
    });
    expect(match).toBeNull();
  });

  it("creates a booking for a selected guest without duplicating the guest", async () => {
    const admin = await adminUser();
    const guest = await prisma.guest.findFirst({
      where: { phone: { not: null }, anonymizedAt: null },
    });
    const room = await prisma.room.findFirst({ where: { isActive: true } });
    if (!guest?.phone || !room) return;

    const checkIn = new Date();
    checkIn.setDate(checkIn.getDate() + 120);
    checkIn.setHours(14, 0, 0, 0);
    const checkOut = new Date(checkIn);
    checkOut.setDate(checkOut.getDate() + 1);
    checkOut.setHours(11, 0, 0, 0);

    const beforeCount = await prisma.guest.count();
    const result = await createBooking(
      {
        guest: {
          fullName: guest.fullName,
          phone: guest.phone,
          email: guest.email ?? undefined,
        },
        guestId: guest.id,
        checkIn,
        checkOut,
        guestCount: 1,
        source: "DIRECT",
        isWholeHouse: false,
        roomIds: [room.id],
        extraBedCount: 0,
        roomNightlyRate: 2500,
        amountPaid: 0,
        status: "CONFIRMED",
      },
      admin,
    );
    expect(result.reference).toMatch(/^BK-/);
    const afterCount = await prisma.guest.count();
    expect(afterCount).toBe(beforeCount);

    await prisma.cleaningTask.deleteMany({ where: { bookingId: result.id } });
    await prisma.booking.delete({ where: { id: result.id } });
  });
});
