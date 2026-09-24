import "dotenv/config";
import { describe, expect, it } from "vitest";
import { normalizeEmail, normalizePhone, phoneDigitsForSearch } from "@/lib/guest-contact";
import { createGuest, findGuestByNormalizedContact } from "@/server/modules/guests/guest.service";
import { createBooking } from "@/server/modules/bookings/booking.service";
import { prisma } from "@/server/db/prisma";
import { ConflictError, ForbiddenError } from "@/server/lib/errors";
import { computeBookingPricing, stayNights } from "@/server/modules/bookings/booking-pricing";

function uniqueStayDates(offsetDays = 0) {
  const checkIn = new Date();
  checkIn.setUTCDate(checkIn.getUTCDate() + 4500 + offsetDays + (Date.now() % 200));
  checkIn.setUTCHours(14, 0, 0, 0);
  const checkOut = new Date(checkIn);
  checkOut.setUTCDate(checkOut.getUTCDate() + 2);
  checkOut.setUTCHours(11, 0, 0, 0);
  return { checkIn, checkOut };
}

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

describe("guest contact normalization", () => {
  it("normalizes Indian phone formats to the same digits", () => {
    expect(normalizePhone("97666 52571")).toBe("9766652571");
    expect(normalizePhone("+91 97666 52571")).toBe("9766652571");
    expect(normalizePhone("(+91) 97666-52571")).toBe("9766652571");
  });

  it("normalizes email to lowercase trimmed", () => {
    expect(normalizeEmail("  Guest@Example.COM ")).toBe("guest@example.com");
  });

  it("extracts partial phone digits for search", () => {
    expect(phoneDigitsForSearch("97666")).toBe("97666");
    expect(phoneDigitsForSearch("+91 97666 52571")).toBe("9766652571");
  });
});

describe("guest duplicate prevention", () => {
  it("rejects duplicate phone with conflict details", async () => {
    const admin = await adminUser();
    const suffix = Date.now().toString().slice(-9);
    const phone = `9${suffix}`;
    const first = await createGuest(admin, { fullName: "Dup Phone A", phone });
    await expect(
      createGuest(admin, { fullName: "Dup Phone B", phone: `+91 ${phone.slice(0, 5)} ${phone.slice(5)}` }),
    ).rejects.toBeInstanceOf(ConflictError);
    const match = await findGuestByNormalizedContact({ phone: `+91-${phone}` });
    expect(match?.guest.id).toBe(first.id);
  });

  it("rejects duplicate email", async () => {
    const admin = await adminUser();
    const email = `dup-${Date.now()}@example.com`;
    await createGuest(admin, { fullName: "Email A", phone: `8${Date.now().toString().slice(-9)}`, email });
    await expect(
      createGuest(admin, {
        fullName: "Email B",
        phone: `8${(Date.now() + 1).toString().slice(-9)}`,
        email: `  ${email.toUpperCase()} `,
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("still allows new unique customers", async () => {
    const admin = await adminUser();
    const guest = await createGuest(admin, {
      fullName: "Unique Guest",
      phone: `7${Date.now().toString().slice(-9)}`,
    });
    expect(guest.id).toBeTruthy();
  });

  it("cleaner cannot create customers", async () => {
    await expect(
      createGuest(
        {
          id: "00000000-0000-0000-0000-000000000002",
          email: "cleaner@guesthouse.local",
          name: "Cleaner",
          role: "CLEANER",
          status: "ACTIVE",
          canViewFinancials: false,
          mfaEnabled: false,
        },
        { fullName: "Nope", phone: "9999999999" },
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("booking customer selection and rates", () => {
  it("uses existing guest when guestId is provided", async () => {
    const admin = await adminUser();
    const room = await prisma.room.findFirst({ where: { isActive: true } });
    if (!room) return;
    const phone = `6${Date.now().toString().slice(-9)}`;
    const guest = await createGuest(admin, { fullName: "Booking Guest", phone });
    const before = await prisma.guest.count();
    const { checkIn, checkOut } = uniqueStayDates(1);
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

  it("rejects booking that would create duplicate customer", async () => {
    const admin = await adminUser();
    const room = await prisma.room.findFirst({ where: { isActive: true } });
    if (!room) return;
    const phone = `5${Date.now().toString().slice(-9)}`;
    await createGuest(admin, { fullName: "Existing", phone });
    await expect(
      createBooking(
        {
          guest: { fullName: "Another Name", phone: `+91 ${phone}` },
          ...uniqueStayDates(2),
          guestCount: 1,
          source: "DIRECT",
          isWholeHouse: false,
          roomIds: [room.id],
        },
        admin,
      ),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("calculates nights and room total from overridden rate", async () => {
    const room = await prisma.room.findFirst({
      where: { isActive: true },
      include: { roomType: true },
    });
    if (!room) return;
    const checkIn = new Date("2026-10-01T14:00:00Z");
    const checkOut = new Date("2026-10-04T11:00:00Z");
    expect(stayNights(checkIn, checkOut)).toBe(3);
    const pricing = await computeBookingPricing({
      checkIn,
      checkOut,
      roomIds: [room.id],
      roomNightlyRate: 1250,
    });
    expect(pricing.nights).toBe(3);
    expect(pricing.roomNightlyRate).toBe(1250);
    expect(pricing.roomStayTotal).toBe(3750);
  });

  it("keeps historical booking rate after room type price changes", async () => {
    const admin = await adminUser();
    const room = await prisma.room.findFirst({
      where: { isActive: true },
      include: { roomType: true },
    });
    if (!room) return;
    const originalBase = Number(room.roomType.baseRate);
    const agreedRate = originalBase > 100 ? originalBase - 100 : originalBase + 500;
    const phone = `4${Date.now().toString().slice(-9)}`;
    const guest = await createGuest(admin, { fullName: "Rate History", phone });
    const { id } = await createBooking(
      {
        guestId: guest.id,
        guest: { fullName: guest.fullName, phone },
        ...uniqueStayDates(3),
        guestCount: 1,
        source: "DIRECT",
        isWholeHouse: false,
        roomIds: [room.id],
        roomNightlyRate: agreedRate,
      },
      admin,
    );
    await prisma.roomType.update({
      where: { id: room.roomTypeId },
      data: { baseRate: originalBase + 9999 },
    });
    const booking = await prisma.booking.findUnique({ where: { id } });
    expect(Number(booking?.roomNightlyRate)).toBe(agreedRate);
    expect(Number(booking?.roomStayTotal)).toBe(agreedRate * 2);
  });
});
