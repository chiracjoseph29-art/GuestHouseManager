import { prisma } from "@/server/db/prisma";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/server/lib/errors";
import { generateBookingReference } from "@/server/lib/crypto";
import { writeAuditLog } from "@/server/modules/audit/audit.service";
import { Prisma, type BookingSource, type BookingStatus, type PaymentStatus } from "@/generated/prisma/client";
import { PERMISSIONS } from "@/server/rbac/permissions";
import type { SessionUser } from "@/server/modules/auth/session.service";

const ACTIVE_STATUSES: BookingStatus[] = ["PENDING", "CONFIRMED", "CHECKED_IN"];

export type CreateBookingInput = {
  guest: { fullName: string; email?: string; phone?: string };
  checkIn: Date;
  checkOut: Date;
  guestCount: number;
  source: BookingSource;
  isWholeHouse: boolean;
  roomIds: string[];
  amountTotal: number;
  amountPaid?: number;
  paymentStatus?: PaymentStatus;
  notes?: string;
};

function validateDates(checkIn: Date, checkOut: Date) {
  if (!(checkIn instanceof Date) || !(checkOut instanceof Date) || checkOut <= checkIn) {
    throw new ValidationError("Check-out must be after check-in.");
  }
}

async function lockRooms(tx: Prisma.TransactionClient, roomIds: string[]) {
  if (roomIds.length === 0) return;
  for (const roomId of roomIds) {
    await tx.$queryRaw(Prisma.sql`SELECT id FROM rooms WHERE id = ${roomId}::uuid FOR UPDATE`);
  }
}

async function findConflicts(
  tx: Prisma.TransactionClient,
  params: {
    checkIn: Date;
    checkOut: Date;
    roomIds: string[];
    isWholeHouse: boolean;
    excludeBookingId?: string;
  },
): Promise<boolean> {
  const { checkIn, checkOut, roomIds, isWholeHouse, excludeBookingId } = params;

  const wholeHouseConflict = await tx.booking.findFirst({
    where: {
      id: excludeBookingId ? { not: excludeBookingId } : undefined,
      isWholeHouse: true,
      status: { in: ACTIVE_STATUSES },
      checkIn: { lt: checkOut },
      checkOut: { gt: checkIn },
    },
  });
  if (wholeHouseConflict) return true;

  if (isWholeHouse) {
    const anyRoomBooking = await tx.booking.findFirst({
      where: {
        id: excludeBookingId ? { not: excludeBookingId } : undefined,
        status: { in: ACTIVE_STATUSES },
        checkIn: { lt: checkOut },
        checkOut: { gt: checkIn },
        bookingRooms: { some: {} },
      },
    });
    return !!anyRoomBooking;
  }

  if (roomIds.length === 0) {
    throw new ValidationError("Select at least one room.");
  }

  const roomConflict = await tx.bookingRoom.findFirst({
    where: {
      roomId: { in: roomIds },
      booking: {
        id: excludeBookingId ? { not: excludeBookingId } : undefined,
        status: { in: ACTIVE_STATUSES },
        checkIn: { lt: checkOut },
        checkOut: { gt: checkIn },
      },
    },
  });
  return !!roomConflict;
}

export async function createBooking(
  input: CreateBookingInput,
  actor: SessionUser,
): Promise<{ id: string; reference: string }> {
  validateDates(input.checkIn, input.checkOut);

  let roomIds = input.roomIds;
  if (input.isWholeHouse) {
    const rooms = await prisma.room.findMany({ where: { isActive: true }, select: { id: true } });
    roomIds = rooms.map((r) => r.id);
    if (roomIds.length === 0) throw new ValidationError("No active rooms configured.");
  }

  const amountPaid = input.amountPaid ?? 0;
  const balance = input.amountTotal - amountPaid;

  const result = await prisma.$transaction(async (tx) => {
    await lockRooms(tx, roomIds);
    const conflict = await findConflicts(tx, {
      checkIn: input.checkIn,
      checkOut: input.checkOut,
      roomIds,
      isWholeHouse: input.isWholeHouse,
    });
    if (conflict) {
      throw new ConflictError("Selected dates conflict with an existing reservation.");
    }

    const guest = await tx.guest.create({
      data: {
        fullName: input.guest.fullName.trim(),
        email: input.guest.email?.trim(),
        phone: input.guest.phone?.trim(),
      },
    });

    const booking = await tx.booking.create({
      data: {
        reference: generateBookingReference(),
        guestId: guest.id,
        checkIn: input.checkIn,
        checkOut: input.checkOut,
        guestCount: input.guestCount,
        source: input.source,
        isWholeHouse: input.isWholeHouse,
        paymentStatus: input.paymentStatus ?? (amountPaid >= input.amountTotal ? "PAID" : amountPaid > 0 ? "PARTIAL" : "UNPAID"),
        amountTotal: input.amountTotal,
        amountPaid,
        balance,
        notes: input.notes,
        status: "CONFIRMED",
        createdById: actor.id,
        bookingRooms: {
          create: roomIds.map((roomId) => ({ roomId })),
        },
      },
    });

    for (const roomId of roomIds) {
      await tx.cleaningTask.create({
        data: {
          roomId,
          bookingId: booking.id,
          status: "PENDING",
          dueAt: input.checkOut,
        },
      });
    }

    return booking;
  });

  await writeAuditLog({
    userId: actor.id,
    action: "booking.created",
    resourceType: "booking",
    resourceId: result.id,
    result: "SUCCESS",
    metadata: { reference: result.reference, isWholeHouse: input.isWholeHouse },
  });

  return { id: result.id, reference: result.reference };
}

export async function listBookings(actor: SessionUser) {
  if (actor.role === "CLEANER") {
    throw new ForbiddenError();
  }
  return prisma.booking.findMany({
    orderBy: { checkIn: "desc" },
    include: {
      guest: { select: { fullName: true, phone: true, email: true } },
      bookingRooms: { include: { room: { select: { id: true, name: true } } } },
    },
    take: 200,
  });
}

export async function getBooking(id: string, actor: SessionUser) {
  if (actor.role === "CLEANER") throw new ForbiddenError();
  const booking = await prisma.booking.findUnique({
    where: { id },
    include: {
      guest: true,
      bookingRooms: { include: { room: true } },
      payments: actor.role === "ADMIN" || (actor.role === "MANAGER" && actor.canViewFinancials)
        ? true
        : false,
    },
  });
  if (!booking) throw new NotFoundError();
  return booking;
}

export async function cancelBooking(id: string, actor: SessionUser) {
  const booking = await prisma.booking.update({
    where: { id },
    data: { status: "CANCELLED", cancelledAt: new Date() },
  });
  await writeAuditLog({
    userId: actor.id,
    action: "booking.cancelled",
    resourceType: "booking",
    resourceId: id,
    result: "SUCCESS",
  });
  return booking;
}

export async function getAvailability(checkIn: Date, checkOut: Date) {
  validateDates(checkIn, checkOut);
  const rooms = await prisma.room.findMany({
    where: { isActive: true },
    include: { roomType: true },
  });

  const wholeHouse = await prisma.booking.findFirst({
    where: {
      isWholeHouse: true,
      status: { in: ACTIVE_STATUSES },
      checkIn: { lt: checkOut },
      checkOut: { gt: checkIn },
    },
  });
  if (wholeHouse) {
    return { wholeHouseBlocked: true, rooms: rooms.map((r) => ({ ...r, available: false })) };
  }

  const busyRoomIds = new Set(
    (
      await prisma.bookingRoom.findMany({
        where: {
          booking: {
            status: { in: ACTIVE_STATUSES },
            checkIn: { lt: checkOut },
            checkOut: { gt: checkIn },
          },
        },
        select: { roomId: true },
      })
    ).map((b) => b.roomId),
  );

  return {
    wholeHouseBlocked: false,
    rooms: rooms.map((r) => ({
      id: r.id,
      name: r.name,
      roomType: r.roomType.name,
      maxGuests: r.roomType.maxGuests,
      baseRate: r.roomType.baseRate,
      available: !busyRoomIds.has(r.id),
    })),
  };
}

export function canManageBookings(actor: SessionUser): boolean {
  return actor.role === "ADMIN";
}

export { PERMISSIONS };
