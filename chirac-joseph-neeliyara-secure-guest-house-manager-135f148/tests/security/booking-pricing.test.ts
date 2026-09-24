import "dotenv/config";
import { describe, expect, it } from "vitest";
import { computeBookingPricing, stayNights } from "@/server/modules/bookings/booking-pricing";
import { prisma } from "@/server/db/prisma";

describe("booking pricing", () => {
  it("calculates room and extra bed totals", async () => {
    const room = await prisma.room.findFirst({
      where: { isActive: true },
      include: { roomType: true },
    });
    if (!room) return;
    const checkIn = new Date("2026-06-10T14:00:00Z");
    const checkOut = new Date("2026-06-12T11:00:00Z");
    const nights = stayNights(checkIn, checkOut);
    expect(nights).toBe(2);
    const pricing = await computeBookingPricing({
      checkIn,
      checkOut,
      roomIds: [room.id],
      extraBedCount: room.roomType.extraBedAllowed ? 1 : 0,
    });
    expect(pricing.roomStayTotal).toBe(Number(room.roomType.baseRate) * nights);
    if (room.roomType.extraBedAllowed) {
      expect(pricing.extraBedTotal).toBeGreaterThan(0);
    }
    expect(pricing.amountTotal).toBe(pricing.roomStayTotal + pricing.extraBedTotal);
  });
});

