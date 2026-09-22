import { describe, it, expect } from "vitest";
import "dotenv/config";
import { randomUUID } from "crypto";
import { prisma } from "@/server/db/prisma";
import { createBooking } from "@/server/modules/bookings/booking.service";
import { applyInventoryChange } from "@/server/modules/inventory/inventory.service";

describe("concurrency", () => {
  it("allows only one overlapping booking under parallel attempts", async () => {
    const admin = await prisma.user.findUniqueOrThrow({ where: { email: "admin@guesthouse.local" } });
    const roomType = await prisma.roomType.findFirstOrThrow();
    const room = await prisma.room.create({
      data: { name: `Race-${randomUUID().slice(0, 8)}`, roomTypeId: roomType.id, isActive: true },
    });
    const start = new Date();
    start.setHours(14, 0, 0, 0);
    start.setDate(start.getDate() + 5000);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);

    const input = {
      guest: { fullName: "Race Guest" },
      checkIn: start,
      checkOut: end,
      guestCount: 1,
      source: "DIRECT" as const,
      isWholeHouse: false,
      roomIds: [room.id],
      amountTotal: 100,
    };

    const results = await Promise.allSettled([
      createBooking(input, admin),
      createBooking({ ...input, guest: { fullName: "Race Guest 2" } }, admin),
    ]);
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(1);
  });

  it("keeps inventory quantity consistent under parallel consumption", async () => {
    const admin = await prisma.user.findUniqueOrThrow({ where: { email: "admin@guesthouse.local" } });
    const item = await prisma.inventoryItem.findFirstOrThrow({ where: { name: "Towels" } });
    const before = item.quantity;
    const attempts = await Promise.allSettled(
      Array.from({ length: 3 }).map(() =>
        applyInventoryChange(
          item.id,
          admin,
          { type: "CONSUMPTION", quantityChange: -1, reason: "parallel test" },
        ),
      ),
    );
    const updated = await prisma.inventoryItem.findUniqueOrThrow({ where: { id: item.id } });
    const successes = attempts.filter((a) => a.status === "fulfilled").length;
    expect(updated.quantity).toBe(before - successes);
  });
});
