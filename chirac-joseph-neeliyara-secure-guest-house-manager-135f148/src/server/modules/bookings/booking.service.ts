import { prisma } from "@/server/db/prisma";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/server/lib/errors";
import { generateBookingReference } from "@/server/lib/crypto";
import { writeAuditLog } from "@/server/modules/audit/audit.service";
import { Prisma, type BookingSource, type BookingStatus, type PaymentStatus } from "@/generated/prisma/client";
import { assertAdminOnly } from "@/server/rbac/authorize";
import { PERMISSIONS } from "@/server/rbac/permissions";
import type { SessionUser } from "@/server/modules/auth/session.service";
import { computeBookingPricing } from "@/server/modules/bookings/booking-pricing";
import {
  findGuestByNormalizedContact,
  guestDuplicateConflict,
} from "@/server/modules/guests/guest.service";
import { normalizeEmail, normalizePhone } from "@/server/lib/guest-contact";

const ACTIVE_STATUSES: BookingStatus[] = ["PENDING", "CONFIRMED", "CHECKED_IN"];

export type CreateBookingInput = {
  guest: { fullName: string; email?: string; phone?: string };
  guestId?: string;
  checkIn: Date;
  checkOut: Date;
  guestCount: number;
  source: BookingSource;
  isWholeHouse: boolean;
  roomIds: string[];
  extraBedCount?: number;
  roomNightlyRate?: number;
  extraBedNightlyRate?: number;
  amountPaid?: number;
  paymentStatus?: PaymentStatus;
  notes?: string;
  status?: BookingStatus;
};

export type UpdateBookingInput = CreateBookingInput & { id: string };

function validateDates(checkIn: Date, checkOut: Date) {
  if (!(checkIn instanceof Date) || !(checkOut instanceof Date) || checkOut <= checkIn) {
    throw new ValidationError("Check-out must be after check-in.");
  }
}

async function lockRooms(tx: Prisma.TransactionClient, roomIds: string[]) {
  if (roomIds.length === 0) return;
  await tx.$queryRaw(
    Prisma.sql`SELECT id FROM rooms WHERE id IN (${Prisma.join(roomIds.map((id) => Prisma.sql`${id}::uuid`))}) FOR UPDATE`,
  );
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

  const inactive = await tx.room.count({ where: { id: { in: roomIds }, isActive: false } });
  if (inactive > 0) {
    throw new ValidationError("One or more selected rooms are inactive.");
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

  const pricing = await computeBookingPricing({
    checkIn: input.checkIn,
    checkOut: input.checkOut,
    roomIds,
    extraBedCount: input.extraBedCount,
    roomNightlyRate: input.roomNightlyRate,
    extraBedNightlyRate: input.extraBedNightlyRate,
  });
  const amountTotal = pricing.amountTotal;
  const amountPaid = input.amountPaid ?? 0;
  const balance = amountTotal - amountPaid;
  let createdGuestId: string | null = null;

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

    let guestId = input.guestId;
    if (guestId) {
      const existing = await tx.guest.findUnique({ where: { id: guestId } });
      if (!existing) throw new NotFoundError("Guest not found.");
      const phoneDisplay = input.guest.phone?.trim() || existing.phone;
      const emailDisplay =
        input.guest.email !== undefined ? input.guest.email.trim() || null : existing.email;
      const duplicate = await findGuestByNormalizedContact(
        {
          phone: phoneDisplay ?? undefined,
          email: emailDisplay ?? undefined,
          excludeGuestId: guestId,
        },
        tx,
      );
      if (duplicate) throw guestDuplicateConflict(duplicate.guest, duplicate.matchedField);
      await tx.guest.update({
        where: { id: guestId },
        data: {
          fullName: input.guest.fullName.trim() || existing.fullName,
          email: emailDisplay,
          emailNormalized: emailDisplay ? normalizeEmail(emailDisplay) : null,
          phone: phoneDisplay,
          phoneNormalized: phoneDisplay ? normalizePhone(phoneDisplay) : null,
        },
      });
    } else {
      const phoneDisplay = input.guest.phone?.trim();
      const emailDisplay = input.guest.email?.trim() || null;
      const duplicate = await findGuestByNormalizedContact(
        {
          phone: phoneDisplay ?? undefined,
          email: emailDisplay ?? undefined,
        },
        tx,
      );
      if (duplicate) throw guestDuplicateConflict(duplicate.guest, duplicate.matchedField);

      const phoneNormalized = phoneDisplay ? normalizePhone(phoneDisplay) : null;
      if (!phoneDisplay || !phoneNormalized) {
        throw new ValidationError("Guest phone number is required.");
      }

      const guest = await tx.guest.create({
        data: {
          fullName: input.guest.fullName.trim(),
          email: emailDisplay,
          emailNormalized: emailDisplay ? normalizeEmail(emailDisplay) : null,
          phone: phoneDisplay,
          phoneNormalized,
        },
      });
      guestId = guest.id;
      createdGuestId = guest.id;
    }

    const booking = await tx.booking.create({
      data: {
        reference: generateBookingReference(),
        guestId,
        checkIn: input.checkIn,
        checkOut: input.checkOut,
        guestCount: input.guestCount,
        source: input.source,
        isWholeHouse: input.isWholeHouse,
        paymentStatus: input.paymentStatus ?? (amountPaid >= amountTotal ? "PAID" : amountPaid > 0 ? "PARTIAL" : "UNPAID"),
        amountTotal,
        amountPaid,
        balance,
        roomNightlyRate: pricing.roomNightlyRate,
        roomStayTotal: pricing.roomStayTotal,
        extraBedCount: pricing.extraBedCount,
        extraBedNightlyRate: pricing.extraBedNightlyRate,
        extraBedTotal: pricing.extraBedTotal,
        notes: input.notes,
        status: input.status ?? "CONFIRMED",
        createdById: actor.id,
        bookingRooms: {
          create: roomIds.map((roomId) => ({ roomId })),
        },
      },
    });

    await tx.cleaningTask.createMany({
      data: roomIds.map((roomId) => ({
        roomId,
        bookingId: booking.id,
        status: "PENDING" as const,
        dueAt: input.checkOut,
      })),
    });

    return booking;
  });

  if (createdGuestId) {
    await writeAuditLog({
      userId: actor.id,
      action: "customer.created",
      resourceType: "guest",
      resourceId: createdGuestId,
      result: "SUCCESS",
      metadata: { fullName: input.guest.fullName.trim() },
    });
  }

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

export async function updateBooking(input: UpdateBookingInput, actor: SessionUser) {
  validateDates(input.checkIn, input.checkOut);

  const existing = await prisma.booking.findUnique({
    where: { id: input.id },
    include: { bookingRooms: true },
  });
  if (!existing) throw new NotFoundError();
  if (existing.status === "CANCELLED") {
    throw new ValidationError("Cancelled bookings cannot be edited.");
  }

  let roomIds = input.roomIds;
  if (input.isWholeHouse) {
    const rooms = await prisma.room.findMany({ where: { isActive: true }, select: { id: true } });
    roomIds = rooms.map((r) => r.id);
    if (roomIds.length === 0) throw new ValidationError("No active rooms configured.");
  }

  const pricing = await computeBookingPricing({
    checkIn: input.checkIn,
    checkOut: input.checkOut,
    roomIds,
    extraBedCount: input.extraBedCount,
    roomNightlyRate: input.roomNightlyRate,
    extraBedNightlyRate: input.extraBedNightlyRate,
  });
  const amountTotal = pricing.amountTotal;
  const amountPaid = input.amountPaid ?? Number(existing.amountPaid);
  const balance = amountTotal - amountPaid;
  const lockIds = [...new Set([...roomIds, ...existing.bookingRooms.map((br) => br.roomId)])];

  const result = await prisma.$transaction(async (tx) => {
    await lockRooms(tx, lockIds);
    const conflict = await findConflicts(tx, {
      checkIn: input.checkIn,
      checkOut: input.checkOut,
      roomIds,
      isWholeHouse: input.isWholeHouse,
      excludeBookingId: input.id,
    });
    if (conflict) {
      throw new ConflictError("Selected dates conflict with an existing reservation.");
    }

    const phoneDisplay = input.guest.phone?.trim() || null;
    const emailDisplay = input.guest.email?.trim() || null;
    const duplicate = await findGuestByNormalizedContact(
      {
        phone: phoneDisplay ?? undefined,
        email: emailDisplay ?? undefined,
        excludeGuestId: existing.guestId,
      },
      tx,
    );
    if (duplicate) throw guestDuplicateConflict(duplicate.guest, duplicate.matchedField);

    await tx.guest.update({
      where: { id: existing.guestId },
      data: {
        fullName: input.guest.fullName.trim(),
        email: emailDisplay,
        emailNormalized: emailDisplay ? normalizeEmail(emailDisplay) : null,
        phone: phoneDisplay,
        phoneNormalized: phoneDisplay ? normalizePhone(phoneDisplay) : null,
      },
    });

    const booking = await tx.booking.update({
      where: { id: input.id },
      data: {
        checkIn: input.checkIn,
        checkOut: input.checkOut,
        guestCount: input.guestCount,
        source: input.source,
        isWholeHouse: input.isWholeHouse,
        status: input.status ?? existing.status,
        paymentStatus:
          input.paymentStatus ??
          (amountPaid >= amountTotal ? "PAID" : amountPaid > 0 ? "PARTIAL" : "UNPAID"),
        amountTotal,
        amountPaid,
        balance,
        roomNightlyRate: pricing.roomNightlyRate,
        roomStayTotal: pricing.roomStayTotal,
        extraBedCount: pricing.extraBedCount,
        extraBedNightlyRate: pricing.extraBedNightlyRate,
        extraBedTotal: pricing.extraBedTotal,
        notes: input.notes,
        version: { increment: 1 },
      },
    });

    await tx.bookingRoom.deleteMany({ where: { bookingId: input.id } });
    await tx.bookingRoom.createMany({
      data: roomIds.map((roomId) => ({ bookingId: input.id, roomId })),
    });

    return booking;
  });

  await writeAuditLog({
    userId: actor.id,
    action: "booking.updated",
    resourceType: "booking",
    resourceId: result.id,
    result: "SUCCESS",
    metadata: { reference: result.reference },
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

export async function deleteBookingPermanent(id: string, actor: SessionUser) {
  assertAdminOnly(actor);

  const booking = await prisma.booking.findUnique({
    where: { id },
    include: {
      guest: { select: { id: true, fullName: true } },
      payments: { select: { id: true } },
      bookingRooms: { include: { room: { select: { name: true } } } },
    },
  });
  if (!booking) throw new NotFoundError();

  if (booking.payments.length > 0) {
    throw new ConflictError(
      "This booking cannot be deleted because payment records exist. Remove or adjust payments first, or keep the booking for audit history.",
    );
  }
  const amountPaid = Number(booking.amountPaid);
  if (amountPaid > 0) {
    throw new ConflictError(
      "This booking cannot be deleted because it has recorded payments. Clear financial records first or keep the booking for audit history.",
    );
  }

  const guestId = booking.guestId;
  const reference = booking.reference;

  await prisma.$transaction(async (tx) => {
    const tasks = await tx.cleaningTask.findMany({
      where: { bookingId: id },
      select: { id: true },
    });
    if (tasks.length > 0) {
      await tx.cleaningTask.deleteMany({ where: { bookingId: id } });
    }
    await tx.booking.delete({ where: { id } });
  });

  const guestStillExists = await prisma.guest.findUnique({ where: { id: guestId }, select: { id: true } });
  if (!guestStillExists) {
    throw new NotFoundError("Guest was unexpectedly removed.");
  }

  await writeAuditLog({
    userId: actor.id,
    action: "booking.deleted",
    resourceType: "booking",
    resourceId: id,
    result: "SUCCESS",
    metadata: { reference, guestId },
  });

  return { id, reference, guestId };
}

export async function getAvailability(checkIn: Date, checkOut: Date, excludeBookingId?: string) {
  validateDates(checkIn, checkOut);
  const rooms = await prisma.room.findMany({
    where: { isActive: true },
    include: { roomType: true },
  });

  const wholeHouse = await prisma.booking.findFirst({
    where: {
      id: excludeBookingId ? { not: excludeBookingId } : undefined,
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
            id: excludeBookingId ? { not: excludeBookingId } : undefined,
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
      extraBedAllowed: r.roomType.extraBedAllowed,
      extraBedRate: r.roomType.extraBedRate,
      available: !busyRoomIds.has(r.id),
    })),
  };
}

export function canManageBookings(actor: SessionUser): boolean {
  return actor.role === "ADMIN";
}

export { PERMISSIONS };
