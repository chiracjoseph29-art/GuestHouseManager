import {
  createRoom,
  listActiveRooms,
  listRoomTypes,
  listRoomsForAdmin,
  updateRoom,
  deleteRoomPermanent,
  updateRoomType,
} from "@/server/modules/rooms/room.service";
import { jsonOk, withAuth } from "@/server/http/api-handler";
import { PERMISSIONS } from "@/server/rbac/permissions";
import { ValidationError } from "@/server/lib/errors";
import { z } from "zod";

export const GET = withAuth(
  [PERMISSIONS.ROOMS_VIEW, PERMISSIONS.INVENTORY_VERIFY],
  async ({ req, correlationId }) => {
  const url = new URL(req.url);
  if (url.searchParams.get("types") === "1") {
    const types = await listRoomTypes();
    return jsonOk({ roomTypes: types }, correlationId);
  }
  const all = url.searchParams.get("all") === "1";
  const rooms = all ? await listRoomsForAdmin() : await listActiveRooms();
  return jsonOk({ rooms }, correlationId);
  },
  { anyOf: true },
);

const roomSchema = z.object({
  name: z.string().min(1).max(100),
  roomTypeId: z.string().uuid(),
  floor: z.string().max(50).optional(),
  notes: z.string().max(5000).optional(),
  isActive: z.boolean().optional(),
});

export const POST = withAuth(PERMISSIONS.ROOMS_MANAGE, async ({ req, user, correlationId }) => {
  const body = await req.json().catch(() => null);
  const parsed = roomSchema.safeParse(body);
  if (!parsed.success) throw new ValidationError();
  const room = await createRoom(user, parsed.data);
  return jsonOk({ room }, correlationId);
});

const roomTypeSchema = z.object({
  baseRate: z.number().min(0).optional(),
  extraBedRate: z.number().min(0).optional(),
  maxGuests: z.number().int().min(1).max(20).optional(),
  extraBedAllowed: z.boolean().optional(),
  description: z.string().max(500).optional(),
});

export const DELETE = withAuth(PERMISSIONS.ROOMS_DELETE_PERMANENT, async ({ req, user, correlationId }) => {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) throw new ValidationError("id is required.");
  const result = await deleteRoomPermanent(user, id);
  return jsonOk(result, correlationId);
});

export const PATCH = withAuth(PERMISSIONS.ROOMS_MANAGE, async ({ req, user, correlationId }) => {
  const url = new URL(req.url);
  const roomTypeId = url.searchParams.get("roomTypeId");
  if (roomTypeId) {
    const body = await req.json().catch(() => null);
    const parsed = roomTypeSchema.safeParse(body);
    if (!parsed.success) throw new ValidationError();
    const roomType = await updateRoomType(user, roomTypeId, parsed.data);
    return jsonOk({ roomType }, correlationId);
  }

  const id = url.searchParams.get("id");
  if (!id) throw new ValidationError("id is required.");
  const body = await req.json().catch(() => null);
  const parsed = roomSchema.partial().safeParse(body);
  if (!parsed.success) throw new ValidationError();
  const room = await updateRoom(user, id, parsed.data);
  return jsonOk({ room }, correlationId);
});
