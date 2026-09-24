import {
  createBooking,
  getAvailability,
  getBooking,
  listBookings,
  cancelBooking,
  deleteBookingPermanent,
  updateBooking,
} from "@/server/modules/bookings/booking.service";
import { jsonOk, withAuth } from "@/server/http/api-handler";
import { createBookingSchema, updateBookingSchema } from "@/server/http/schemas";
import { isBookingFlowDebug, logBookingFlow } from "@/server/lib/booking-flow-log";
import { computeBookingPricing } from "@/server/modules/bookings/booking-pricing";
import { assertPermission } from "@/server/rbac/authorize";
import { PERMISSIONS } from "@/server/rbac/permissions";
import { ConflictError, ValidationError } from "@/server/lib/errors";

export const GET = withAuth(PERMISSIONS.BOOKINGS_VIEW, async ({ user, correlationId, req }) => {
  const url = new URL(req.url);
  const availability = url.searchParams.get("availability");
  if (availability === "1") {
    const checkIn = url.searchParams.get("checkIn");
    const checkOut = url.searchParams.get("checkOut");
    if (!checkIn || !checkOut) throw new ValidationError("checkIn and checkOut are required.");
    const excludeBookingId = url.searchParams.get("excludeBookingId") ?? undefined;
    const data = await getAvailability(new Date(checkIn), new Date(checkOut), excludeBookingId);
    return jsonOk(data, correlationId);
  }
  const id = url.searchParams.get("id");
  if (id) {
    const booking = await getBooking(id, user);
    return jsonOk({ booking }, correlationId);
  }
  const bookings = await listBookings(user);
  return jsonOk({ bookings }, correlationId);
});

export const POST = withAuth(PERMISSIONS.BOOKINGS_MANAGE, async ({ req, user, correlationId }) => {
  logBookingFlow("post.reached", req, user, { correlationId });
  const body = await req.json().catch(() => null);
  const parsed = createBookingSchema.safeParse(body);
  if (!parsed.success) {
    logBookingFlow("post.validation_failed", req, user, { correlationId });
    throw new ValidationError(parsed.error.message);
  }
  logBookingFlow("post.validation_ok", req, user, {
    correlationId,
    guestId: parsed.data.guestId ?? null,
    roomCount: parsed.data.roomIds.length,
    isWholeHouse: parsed.data.isWholeHouse,
    checkIn: parsed.data.checkIn,
    checkOut: parsed.data.checkOut,
  });
  const checkIn = new Date(parsed.data.checkIn);
  const checkOut = new Date(parsed.data.checkOut);
  if (isBookingFlowDebug() && parsed.data.roomIds.length > 0) {
    try {
      const pricingPreview = await computeBookingPricing({
        checkIn,
        checkOut,
        roomIds: parsed.data.roomIds,
        extraBedCount: parsed.data.extraBedCount,
        roomNightlyRate: parsed.data.roomNightlyRate,
        extraBedNightlyRate: parsed.data.extraBedNightlyRate,
      });
      logBookingFlow("post.pricing_preview", req, user, {
        correlationId,
        amountTotal: pricingPreview.amountTotal,
        nights: pricingPreview.nights,
      });
    } catch {
      /* createBooking will surface the same validation error */
    }
  }
  try {
    const result = await createBooking(
      {
        ...parsed.data,
        checkIn,
        checkOut,
      },
      user,
    );
    logBookingFlow("post.success", req, user, {
      correlationId,
      bookingId: result.id,
      reference: result.reference,
    });
    return jsonOk(result, correlationId);
  } catch (err) {
    const category =
      err instanceof ValidationError
        ? "validation"
        : err instanceof ConflictError
          ? "conflict"
          : "error";
    logBookingFlow("post.failed", req, user, { correlationId, category });
    throw err;
  }
});

export const PATCH = withAuth(PERMISSIONS.BOOKINGS_MANAGE, async ({ req, user, correlationId }) => {
  const body = await req.json().catch(() => null);
  const parsed = updateBookingSchema.safeParse(body);
  if (!parsed.success) throw new ValidationError(parsed.error.message);
  const { id, ...rest } = parsed.data;
  const result = await updateBooking(
    {
      id,
      ...rest,
      checkIn: new Date(rest.checkIn),
      checkOut: new Date(rest.checkOut),
    },
    user,
  );
  return jsonOk(result, correlationId);
});

export const DELETE = withAuth(PERMISSIONS.BOOKINGS_MANAGE, async ({ req, user, correlationId }) => {
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) throw new ValidationError("id is required.");
  if (url.searchParams.get("permanent") === "1") {
    assertPermission(user, PERMISSIONS.BOOKINGS_DELETE_PERMANENT);
    const result = await deleteBookingPermanent(id, user);
    return jsonOk(result, correlationId);
  }
  await cancelBooking(id, user);
  return jsonOk({ ok: true }, correlationId);
});
