import "dotenv/config";
import { describe, expect, it } from "vitest";
import { prisma } from "@/server/db/prisma";
import { createGuest, searchGuests } from "@/server/modules/guests/guest.service";
import { createBooking } from "@/server/modules/bookings/booking.service";
import { phoneDigitsForSearch } from "@/lib/guest-contact";

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

describe("guest search", () => {
  it("finds customer by exact and partial name (case-insensitive)", async () => {
    const admin = await adminUser();
    const token = Date.now();
    const phone = `8${token.toString().slice(-9)}`;
    const created = await createGuest(admin, {
      fullName: `SearchName ${token}`,
      phone,
      email: `search-${token}@example.com`,
    });

    const exact = await searchGuests(admin, { q: created.fullName });
    expect(exact.some((g) => g.id === created.id)).toBe(true);

    const partial = await searchGuests(admin, { q: `searchname ${token}`.toLowerCase() });
    expect(partial.some((g) => g.id === created.id)).toBe(true);
  });

  it("finds customer by formatted Indian phone variants", async () => {
    const admin = await adminUser();
    const suffix = Date.now().toString().slice(-9);
    const phone = `9${suffix}`;
    const created = await createGuest(admin, {
      fullName: `Phone Search ${suffix}`,
      phone: `${phone.slice(0, 5)} ${phone.slice(5)}`,
    });

    const variants = [
      phone,
      `${phone.slice(0, 5)} ${phone.slice(5)}`,
      `+91 ${phone.slice(0, 5)} ${phone.slice(5)}`,
      `+91${phone}`,
    ];
    for (const q of variants) {
      const found = await searchGuests(admin, { q });
      expect(found.some((g) => g.id === created.id)).toBe(true);
    }
    expect(phoneDigitsForSearch(`+91 ${phone}`)).toBe(phone);
  });

  it("finds customer by email case-insensitively", async () => {
    const admin = await adminUser();
    const token = Date.now();
    const email = `picker-${token}@example.com`;
    const created = await createGuest(admin, {
      fullName: `Email Search ${token}`,
      phone: `7${token.toString().slice(-9)}`,
      email,
    });

    const found = await searchGuests(admin, { q: email.toUpperCase() });
    expect(found.some((g) => g.id === created.id)).toBe(true);
  });

  it("returns address and id fields for booking auto-fill", async () => {
    const admin = await adminUser();
    const token = Date.now();
    const created = await createGuest(admin, {
      fullName: `Profile Fields ${token}`,
      phone: `6${token.toString().slice(-9)}`,
      address: "12 Test Lane",
      idType: "Aadhaar",
      idNumber: "XXXX-1234",
    });

    const found = await searchGuests(admin, { q: created.fullName });
    const row = found.find((g) => g.id === created.id);
    expect(row?.address).toBe("12 Test Lane");
    expect(row?.idType).toBe("Aadhaar");
    expect(row?.idNumber).toBe("XXXX-1234");
  });

  it("booking with guestId does not create a second customer", async () => {
    const admin = await adminUser();
    const room = await prisma.room.findFirst({ where: { isActive: true } });
    if (!room) return;
    const token = Date.now();
    const phone = `5${token.toString().slice(-9)}`;
    const guest = await createGuest(admin, { fullName: `Booking Link ${token}`, phone });
    const before = await prisma.guest.count();
    const day = 4000 + (token % 500);
    const checkIn = new Date();
    checkIn.setUTCDate(checkIn.getUTCDate() + day);
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
    const after = await prisma.guest.count();
    expect(after).toBe(before);
  });
});
