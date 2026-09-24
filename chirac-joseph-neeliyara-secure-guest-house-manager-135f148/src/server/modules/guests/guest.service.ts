import { Prisma } from "@/generated/prisma/client";

import { prisma } from "@/server/db/prisma";

import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/server/lib/errors";

import { normalizeEmail, normalizePhone, phoneDigitsForSearch } from "@/server/lib/guest-contact";

import { writeAuditLog } from "@/server/modules/audit/audit.service";

import type { SessionUser } from "@/server/modules/auth/session.service";

import { assertAdminOnly, assertPermission } from "@/server/rbac/authorize";

import { PERMISSIONS } from "@/server/rbac/permissions";



const DUPLICATE_CUSTOMER_MESSAGE = "Customer already exists. Use the existing customer instead.";



function toNumber(value: { toString(): string } | number | null | undefined): number {

  if (value == null) return 0;

  return typeof value === "number" ? value : Number(value);

}



function assertGuestAccess(user: SessionUser) {

  if (user.role === "CLEANER") throw new ForbiddenError();

  assertPermission(user, PERMISSIONS.BOOKINGS_VIEW);

}



function assertGuestCreate(user: SessionUser) {

  if (user.role === "CLEANER") throw new ForbiddenError();

  assertPermission(user, PERMISSIONS.BOOKINGS_VIEW);

}



export type GuestContactLookup = {

  guest: { id: string; fullName: string; email: string | null; phone: string | null };

  matchedField: "phone" | "email";

};



export function guestDuplicateConflict(existing: GuestContactLookup["guest"], matchedField: "phone" | "email") {

  return new ConflictError(DUPLICATE_CUSTOMER_MESSAGE, {

    existingGuestId: existing.id,

    existingGuest: {

      id: existing.id,

      fullName: existing.fullName,

      phone: existing.phone,

      email: existing.email,

    },

    matchedField,

  });

}



export async function findGuestByNormalizedContact(

  params: { phone?: string; email?: string; excludeGuestId?: string },

  client: Prisma.TransactionClient | typeof prisma = prisma,

): Promise<GuestContactLookup | null> {

  const phoneNorm = params.phone ? normalizePhone(params.phone) : null;

  const emailNorm = params.email ? normalizeEmail(params.email) : null;

  const exclude = params.excludeGuestId ? { id: { not: params.excludeGuestId } } : {};



  if (phoneNorm) {

    const guest = await client.guest.findFirst({

      where: { phoneNormalized: phoneNorm, anonymizedAt: null, ...exclude },

      select: { id: true, fullName: true, email: true, phone: true },

    });

    if (guest) return { guest, matchedField: "phone" };

  }



  if (emailNorm) {

    const guest = await client.guest.findFirst({

      where: { emailNormalized: emailNorm, anonymizedAt: null, ...exclude },

      select: { id: true, fullName: true, email: true, phone: true },

    });

    if (guest) return { guest, matchedField: "email" };

  }



  return null;

}



export async function createGuest(

  actor: SessionUser,

  input: {

    fullName: string;

    phone: string;

    email?: string;

    address?: string;

    idType?: string;

    idNumber?: string;

    notes?: string;

  },

) {

  assertGuestCreate(actor);

  const fullName = input.fullName.trim();

  const phoneDisplay = input.phone.trim();

  if (!fullName) throw new ValidationError("Full name is required.");

  if (!phoneDisplay) throw new ValidationError("Phone number is required.");



  const phoneNormalized = normalizePhone(phoneDisplay);

  if (!phoneNormalized) throw new ValidationError("Phone number is not valid.");



  const emailDisplay = input.email?.trim() || null;

  const emailNormalized = emailDisplay ? normalizeEmail(emailDisplay) : null;



  const duplicate = await findGuestByNormalizedContact({

    phone: phoneDisplay,

    email: emailDisplay ?? undefined,

  });

  if (duplicate) throw guestDuplicateConflict(duplicate.guest, duplicate.matchedField);



  const guest = await prisma.guest.create({

    data: {

      fullName,

      phone: phoneDisplay,

      phoneNormalized,

      email: emailDisplay,

      emailNormalized,

      address: input.address?.trim() || null,

      idType: input.idType?.trim() || null,

      idNumber: input.idNumber?.trim() || null,

      notes: input.notes?.trim() || null,

    },

  });



  await writeAuditLog({

    userId: actor.id,

    action: "customer.created",

    resourceType: "guest",

    resourceId: guest.id,

    result: "SUCCESS",

    metadata: { fullName: guest.fullName, phone: guest.phone },

  });



  return {

    id: guest.id,

    fullName: guest.fullName,

    email: guest.email,

    phone: guest.phone,

    address: guest.address,

    idType: guest.idType,

    idNumber: guest.idNumber,

    notes: guest.notes,

  };

}



function phoneSearchOrClauses(raw: string): Prisma.GuestWhereInput[] {
  const trimmed = raw.trim();
  const or: Prisma.GuestWhereInput[] = [
    { phone: { contains: trimmed, mode: "insensitive" } },
  ];
  const digits = phoneDigitsForSearch(trimmed);
  if (digits) {
    or.push({ phoneNormalized: { startsWith: digits } });
    or.push({ phone: { contains: digits, mode: "insensitive" } });
  }
  const phoneNorm = normalizePhone(trimmed);
  if (phoneNorm) {
    or.push({ phoneNormalized: phoneNorm });
  }
  return or;
}

function emailSearchOrClauses(raw: string): Prisma.GuestWhereInput[] {
  const trimmed = raw.trim();
  const or: Prisma.GuestWhereInput[] = [
    { email: { contains: trimmed, mode: "insensitive" } },
  ];
  const emailNorm = normalizeEmail(trimmed);
  if (emailNorm && emailNorm.includes("@")) {
    or.push({ emailNormalized: emailNorm });
  }
  return or;
}

function buildGuestSearchWhere(query: { q?: string; phone?: string; email?: string }): Prisma.GuestWhereInput {
  const where: Prisma.GuestWhereInput = { anonymizedAt: null };

  if (query.phone?.trim()) {
    where.OR = phoneSearchOrClauses(query.phone);
    return where;
  }

  if (query.email?.trim()) {
    where.OR = emailSearchOrClauses(query.email);
    return where;
  }

  if (query.q?.trim()) {
    const q = query.q.trim();
    const or: Prisma.GuestWhereInput[] = [
      { fullName: { contains: q, mode: "insensitive" } },
      ...phoneSearchOrClauses(q),
      ...emailSearchOrClauses(q),
    ];
    where.OR = or;
    return where;
  }

  return where;
}



export async function searchGuests(

  actor: SessionUser,

  query: { q?: string; phone?: string; email?: string; limit?: number },

) {

  assertGuestAccess(actor);

  const limit = Math.min(query.limit ?? 20, 50);

  const where = buildGuestSearchWhere(query);

  if (!query.q?.trim() && !query.phone?.trim() && !query.email?.trim()) {

    return [];

  }



  const guests = await prisma.guest.findMany({

    where,

    orderBy: { fullName: "asc" },

    take: limit,

    select: {
      id: true,
      fullName: true,
      email: true,
      phone: true,
      address: true,
      idType: true,
      idNumber: true,
    },
  });

  return guests;
}

export async function listCustomers(actor: SessionUser, search?: string) {

  assertGuestAccess(actor);



  const where = search?.trim() ? buildGuestSearchWhere({ q: search }) : { anonymizedAt: null };



  const guests = await prisma.guest.findMany({

    where,

    orderBy: { updatedAt: "desc" },

    take: 200,

    select: { id: true, fullName: true, email: true, phone: true },

  });



  if (guests.length === 0) return [];



  const ids = guests.map((g) => g.id);



  const [bookingStats, paymentStats] = await Promise.all([

    prisma.booking.groupBy({

      by: ["guestId"],

      where: { guestId: { in: ids }, status: { not: "CANCELLED" } },

      _count: { id: true },

      _sum: { balance: true, amountTotal: true },

      _max: { checkOut: true },

      _min: { checkIn: true },

    }),

    prisma.$queryRaw<{ guest_id: string; total_paid: string }[]>`

      SELECT b.guest_id, COALESCE(SUM(p.amount), 0)::text AS total_paid

      FROM payments p

      INNER JOIN bookings b ON b.id = p.booking_id

      WHERE b.guest_id IN (${Prisma.join(ids.map((id) => Prisma.sql`${id}::uuid`))})

      GROUP BY b.guest_id

    `,

  ]);



  const bookingMap = new Map(bookingStats.map((b) => [b.guestId, b]));

  const paidMap = new Map(paymentStats.map((p) => [p.guest_id, Number(p.total_paid)]));



  return guests.map((g) => {

    const stats = bookingMap.get(g.id);

    const stayCount = stats?._count.id ?? 0;

    const outstanding = toNumber(stats?._sum.balance);

    const totalSpent = paidMap.get(g.id) ?? 0;

    const lastStay = stats?._max.checkOut?.toISOString() ?? null;

    return {

      id: g.id,

      fullName: g.fullName,

      email: g.email,

      phone: g.phone,

      stayCount,

      totalSpent,

      outstanding,

      lastStay,

    };

  });

}



export async function getCustomerProfile(actor: SessionUser, guestId: string) {

  assertGuestAccess(actor);



  const guest = await prisma.guest.findUnique({

    where: { id: guestId },

    select: {

      id: true,

      fullName: true,

      email: true,

      phone: true,

      address: true,

      idType: true,

      idNumber: true,

      notes: true,

      createdAt: true,

    },

  });

  if (!guest || guest.id !== guestId) throw new NotFoundError();



  const bookings = await prisma.booking.findMany({

    where: { guestId, status: { not: "CANCELLED" } },

    orderBy: { checkIn: "desc" },

    include: {

      bookingRooms: { include: { room: { select: { name: true } } } },

      payments: { orderBy: { recordedAt: "desc" } },

    },

  });



  const totalPaid = bookings.reduce(

    (sum, b) => sum + b.payments.reduce((s, p) => s + toNumber(p.amount), 0),

    0,

  );

  const outstanding = bookings.reduce((sum, b) => sum + toNumber(b.balance), 0);

  const bookingValue = bookings.reduce((sum, b) => sum + toNumber(b.amountTotal), 0);

  const stayCount = bookings.length;

  const lastBooking = bookings[0] ?? null;

  const firstBooking = bookings.length ? bookings[bookings.length - 1] : null;

  const avgBookingValue = stayCount > 0 ? bookingValue / stayCount : 0;



  const payments = bookings.flatMap((b) =>

    b.payments.map((p) => ({

      id: p.id,

      amount: toNumber(p.amount),

      method: p.method,

      reference: p.reference,

      recordedAt: p.recordedAt.toISOString(),

      bookingId: b.id,

      bookingReference: b.reference,

    })),

  );

  payments.sort((a, b) => (a.recordedAt < b.recordedAt ? 1 : -1));



  return {

    guest: {

      ...guest,

      createdAt: guest.createdAt.toISOString(),

    },

    stats: {

      stayCount,

      totalPaid,

      outstanding,

      bookingValue,

      avgBookingValue,

      lastStay: lastBooking?.checkOut.toISOString() ?? null,

      firstStay: firstBooking?.checkIn.toISOString() ?? null,

      lastBookingReference: lastBooking?.reference ?? null,

    },

    bookings: bookings.map((b) => ({

      id: b.id,

      reference: b.reference,

      roomNames: b.bookingRooms.map((br) => br.room.name).join(", "),

      checkIn: b.checkIn.toISOString(),

      checkOut: b.checkOut.toISOString(),

      amountTotal: toNumber(b.amountTotal),

      amountPaid: toNumber(b.amountPaid),

      balance: toNumber(b.balance),

      paymentStatus: b.paymentStatus,

    })),

    payments,

  };

}



export async function updateGuest(

  actor: SessionUser,

  guestId: string,

  data: { fullName?: string; email?: string; phone?: string; notes?: string },

) {

  assertPermission(actor, PERMISSIONS.BOOKINGS_MANAGE);

  const existing = await prisma.guest.findUnique({ where: { id: guestId } });

  if (!existing) throw new NotFoundError();

  if (data.fullName !== undefined && !data.fullName.trim()) {

    throw new ValidationError("Name is required.");

  }



  const phoneDisplay =

    data.phone !== undefined ? data.phone.trim() || null : existing.phone;

  const emailDisplay =

    data.email !== undefined ? data.email.trim() || null : existing.email;



  const phoneNormalized = phoneDisplay ? normalizePhone(phoneDisplay) : null;

  const emailNormalized = emailDisplay ? normalizeEmail(emailDisplay) : null;



  if (phoneDisplay && !phoneNormalized) {

    throw new ValidationError("Phone number is not valid.");

  }



  const duplicate = await findGuestByNormalizedContact(

    {

      phone: phoneDisplay ?? undefined,

      email: emailDisplay ?? undefined,

      excludeGuestId: guestId,

    },

  );

  if (duplicate) throw guestDuplicateConflict(duplicate.guest, duplicate.matchedField);



  const guest = await prisma.guest.update({

    where: { id: guestId },

    data: {

      fullName: data.fullName?.trim() ?? existing.fullName,

      email: emailDisplay,

      emailNormalized,

      phone: phoneDisplay,

      phoneNormalized,

      notes: data.notes !== undefined ? data.notes.trim() || null : existing.notes,

    },

  });



  await writeAuditLog({

    userId: actor.id,

    action: "customer.updated",

    resourceType: "guest",

    resourceId: guestId,

    result: "SUCCESS",

    metadata: { fullName: guest.fullName },

  });



  return guest;

}

export async function deleteGuestPermanent(actor: SessionUser, guestId: string) {
  assertAdminOnly(actor);

  const guest = await prisma.guest.findUnique({
    where: { id: guestId },
    select: {
      id: true,
      fullName: true,
      email: true,
      phone: true,
      _count: { select: { bookings: true } },
    },
  });
  if (!guest) throw new NotFoundError();

  if (guest._count.bookings > 0) {
    throw new ConflictError(
      `This customer cannot be deleted because ${guest._count.bookings} booking(s) still exist. Delete those bookings first if they are test data, or keep this customer for history.`,
    );
  }

  await prisma.guest.delete({ where: { id: guestId } });

  await writeAuditLog({
    userId: actor.id,
    action: "customer.deleted",
    resourceType: "guest",
    resourceId: guestId,
    result: "SUCCESS",
    metadata: { fullName: guest.fullName, phone: guest.phone, email: guest.email },
  });

  return { id: guestId };
}

