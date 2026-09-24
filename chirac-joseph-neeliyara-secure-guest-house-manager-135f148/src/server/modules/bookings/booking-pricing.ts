import { prisma } from "@/server/db/prisma";
import { ValidationError } from "@/server/lib/errors";

export function stayNights(checkIn: Date, checkOut: Date): number {
  const start = new Date(checkIn);
  start.setHours(0, 0, 0, 0);
  const end = new Date(checkOut);
  end.setHours(0, 0, 0, 0);
  const diff = Math.round((end.getTime() - start.getTime()) / 86_400_000);
  return Math.max(1, diff);
}

export type BookingPricing = {
  nights: number;
  roomNightlyRate: number;
  roomStayTotal: number;
  extraBedCount: number;
  extraBedNightlyRate: number;
  extraBedTotal: number;
  amountTotal: number;
  extraBedAllowed: boolean;
};

export async function computeBookingPricing(input: {
  checkIn: Date;
  checkOut: Date;
  roomIds: string[];
  extraBedCount?: number;
  roomNightlyRate?: number;
  extraBedNightlyRate?: number;
}): Promise<BookingPricing> {
  const nights = stayNights(input.checkIn, input.checkOut);
  if (input.roomIds.length === 0) {
    return {
      nights,
      roomNightlyRate: input.roomNightlyRate ?? 0,
      roomStayTotal: (input.roomNightlyRate ?? 0) * nights,
      extraBedCount: 0,
      extraBedNightlyRate: 0,
      extraBedTotal: 0,
      amountTotal: (input.roomNightlyRate ?? 0) * nights,
      extraBedAllowed: false,
    };
  }

  const rooms = await prisma.room.findMany({
    where: { id: { in: input.roomIds } },
    include: { roomType: true },
  });
  if (rooms.length !== input.roomIds.length) {
    throw new ValidationError("One or more selected rooms are invalid.");
  }

  const defaultRoomNightlyRate = rooms.reduce((sum, room) => sum + Number(room.roomType.baseRate), 0);
  const roomNightlyRate =
    input.roomNightlyRate !== undefined ? input.roomNightlyRate : defaultRoomNightlyRate;
  const roomStayTotal = roomNightlyRate * nights;

  let extraBedAllowed = false;
  let defaultExtraBedNightlyRate = 0;
  for (const room of rooms) {
    if (room.roomType.extraBedAllowed) {
      extraBedAllowed = true;
      defaultExtraBedNightlyRate = Math.max(
        defaultExtraBedNightlyRate,
        Number(room.roomType.extraBedRate),
      );
    }
  }
  const extraBedNightlyRate =
    input.extraBedNightlyRate !== undefined ? input.extraBedNightlyRate : defaultExtraBedNightlyRate;

  const requestedBeds = Math.max(0, input.extraBedCount ?? 0);
  const extraBedCount = extraBedAllowed ? requestedBeds : 0;
  if (requestedBeds > 0 && !extraBedAllowed) {
    throw new ValidationError("Extra beds are not available for the selected room type.");
  }

  const extraBedTotal = extraBedCount * extraBedNightlyRate * nights;
  const amountTotal = roomStayTotal + extraBedTotal;

  return {
    nights,
    roomNightlyRate,
    roomStayTotal,
    extraBedCount,
    extraBedNightlyRate,
    extraBedTotal,
    amountTotal,
    extraBedAllowed,
  };
}
