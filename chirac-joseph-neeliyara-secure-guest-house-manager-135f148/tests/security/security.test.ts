import { describe, it, expect, beforeAll } from "vitest";
import "dotenv/config";
import { prisma } from "@/server/db/prisma";
import { assertPermission } from "@/server/rbac/authorize";
import { PERMISSIONS } from "@/server/rbac/permissions";
import { ForbiddenError } from "@/server/lib/errors";
import { completeCleaningTask } from "@/server/modules/cleaning/cleaning.service";
import { createBooking } from "@/server/modules/bookings/booking.service";

describe("authorization", () => {
  it("denies cleaner from finance permissions", () => {
    expect(() =>
      assertPermission({ role: "CLEANER", canViewFinancials: false }, PERMISSIONS.FINANCE_VIEW),
    ).toThrow(ForbiddenError);
  });

  it("denies manager without financial flag", () => {
    expect(() =>
      assertPermission({ role: "MANAGER", canViewFinancials: false }, PERMISSIONS.FINANCE_VIEW),
    ).toThrow(ForbiddenError);
  });

  it("allows admin full permissions", () => {
    expect(() => assertPermission({ role: "ADMIN", canViewFinancials: false }, PERMISSIONS.USERS_MANAGE)).not.toThrow();
  });
});

describe("cleaning enforcement", () => {
  it("rejects completion without photo", async () => {
    const cleaner = await prisma.user.findUniqueOrThrow({ where: { email: "cleaner@guesthouse.local" } });
    const task = await prisma.cleaningTask.findFirst({ where: { assignedToId: cleaner.id } });
    if (!task) return;
    await expect(completeCleaningTask(task.id, cleaner)).rejects.toThrow(/photo/i);
  });
});

describe("booking conflicts", () => {
  beforeAll(async () => {
    const admin = await prisma.user.findUniqueOrThrow({ where: { email: "admin@guesthouse.local" } });
    const room = await prisma.room.findFirstOrThrow();
    const start = new Date();
    start.setDate(start.getDate() + 30);
    const end = new Date(start);
    end.setDate(end.getDate() + 2);
    try {
      await createBooking(
        {
          guest: { fullName: "Conflict Test Guest", phone: `1${Date.now().toString().slice(-9)}` },
          checkIn: start,
          checkOut: end,
          guestCount: 2,
          source: "DIRECT",
          isWholeHouse: false,
          roomIds: [room.id],
        },
        admin,
      );
      await createBooking(
        {
          guest: { fullName: "Conflict Test Guest 2", phone: `1${(Date.now() + 3).toString().slice(-9)}` },
          checkIn: start,
          checkOut: end,
          guestCount: 2,
          source: "DIRECT",
          isWholeHouse: false,
          roomIds: [room.id],
        },
        admin,
      );
    } catch {
      /* expected on second booking */
    }
  });

  it("prevents duplicate overlapping room booking", async () => {
    const admin = await prisma.user.findUniqueOrThrow({ where: { email: "admin@guesthouse.local" } });
    const room = await prisma.room.findFirstOrThrow();
    const dayOffset = 300 + Math.floor(Math.random() * 1000);
    const start = new Date();
    start.setHours(12, 0, 0, 0);
    start.setDate(start.getDate() + dayOffset);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    await createBooking(
      {
        guest: { fullName: "Overlap A", phone: `1${(Date.now() + 10).toString().slice(-9)}` },
        checkIn: start,
        checkOut: end,
        guestCount: 1,
        source: "DIRECT",
        isWholeHouse: false,
        roomIds: [room.id],
      },
      admin,
    );
    await expect(
      createBooking(
        {
          guest: { fullName: "Overlap B", phone: `1${(Date.now() + 11).toString().slice(-9)}` },
          checkIn: start,
          checkOut: end,
          guestCount: 1,
          source: "DIRECT",
          isWholeHouse: false,
          roomIds: [room.id],
        },
        admin,
      ),
    ).rejects.toThrow(/conflict/i);
  });
});
