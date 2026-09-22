import { createBooking, getAvailability, listBookings, cancelBooking } from "@/server/modules/bookings/booking.service";
import { jsonOk, withAuth } from "@/server/http/api-handler";
import { createBookingSchema } from "@/server/http/schemas";
import { PERMISSIONS } from "@/server/rbac/permissions";
import { ValidationError } from "@/server/lib/errors";

export const GET = withAuth(PERMISSIONS.BOOKINGS_VIEW, async ({ user, correlationId, req }) => {
  const url = new URL(req.url);
  const availability = url.searchParams.get("availability");
  if (availability === "1") {
    const checkIn = url.searchParams.get("checkIn");
    const checkOut = url.searchParams.get("checkOut");
    if (!checkIn || !checkOut) throw new ValidationError("checkIn and checkOut are required.");
    const data = await getAvailability(new Date(checkIn), new Date(checkOut));
    return jsonOk(data, correlationId);
  }
  const bookings = await listBookings(user);
  return jsonOk({ bookings }, correlationId);
});

export const POST = withAuth(PERMISSIONS.BOOKINGS_MANAGE, async ({ req, user, correlationId }) => {
  const body = await req.json().catch(() => null);
  const parsed = createBookingSchema.safeParse(body);
  if (!parsed.success) throw new ValidationError(parsed.error.message);
  const result = await createBooking(
    {
      ...parsed.data,
      checkIn: new Date(parsed.data.checkIn),
      checkOut: new Date(parsed.data.checkOut),
    },
    user,
  );
  return jsonOk(result, correlationId);
});

export const DELETE = withAuth(PERMISSIONS.BOOKINGS_MANAGE, async ({ req, user, correlationId }) => {
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) throw new ValidationError("id is required.");
  await cancelBooking(id, user);
  return jsonOk({ ok: true }, correlationId);
});
