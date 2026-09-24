import {
  createGuest,
  getCustomerProfile,
  listCustomers,
  searchGuests,
  deleteGuestPermanent,
  updateGuest,
} from "@/server/modules/guests/guest.service";
import { jsonOk, withAuth } from "@/server/http/api-handler";
import { PERMISSIONS } from "@/server/rbac/permissions";
import { ValidationError } from "@/server/lib/errors";
import { z } from "zod";

export const GET = withAuth(PERMISSIONS.BOOKINGS_VIEW, async ({ req, user, correlationId }) => {
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (id) {
    const profile = await getCustomerProfile(user, id);
    return jsonOk(profile, correlationId);
  }
  if (url.searchParams.get("search") === "1") {
    const guests = await searchGuests(user, {
      q: url.searchParams.get("q") ?? undefined,
      phone: url.searchParams.get("phone") ?? undefined,
      email: url.searchParams.get("email") ?? undefined,
    });
    return jsonOk({ guests }, correlationId);
  }
  const q = url.searchParams.get("q") ?? undefined;
  const customers = await listCustomers(user, q);
  return jsonOk({ customers }, correlationId);
});

export const POST = withAuth(PERMISSIONS.BOOKINGS_VIEW, async ({ req, user, correlationId }) => {
  const body = await req.json().catch(() => null);
  const schema = z.object({
    fullName: z.string().min(1).max(200),
    phone: z.string().min(1).max(30),
    email: z.string().email().max(320).optional().or(z.literal("")),
    address: z.string().max(500).optional(),
    idType: z.string().max(50).optional(),
    idNumber: z.string().max(100).optional(),
    notes: z.string().max(5000).optional(),
  });
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new ValidationError();
  const guest = await createGuest(user, {
    ...parsed.data,
    email: parsed.data.email || undefined,
  });
  return jsonOk({ guest }, correlationId);
});

export const DELETE = withAuth(PERMISSIONS.BOOKINGS_VIEW, async ({ req, user, correlationId }) => {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) throw new ValidationError("id is required.");
  const result = await deleteGuestPermanent(user, id);
  return jsonOk(result, correlationId);
});

export const PUT = withAuth(PERMISSIONS.BOOKINGS_MANAGE, async ({ req, user, correlationId }) => {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) throw new ValidationError("id is required.");
  const body = await req.json().catch(() => null);
  const schema = z.object({
    fullName: z.string().min(1).max(200).optional(),
    email: z.string().email().optional().or(z.literal("")),
    phone: z.string().max(30).optional(),
    notes: z.string().max(5000).optional(),
  });
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new ValidationError();
  const guest = await updateGuest(user, id, parsed.data);
  return jsonOk({ guest }, correlationId);
});
