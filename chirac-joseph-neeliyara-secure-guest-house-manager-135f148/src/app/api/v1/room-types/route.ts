import { z } from "zod";
import { jsonOk, withAuth } from "@/server/http/api-handler";
import { ValidationError } from "@/server/lib/errors";
import {
  createRoomType,
  deleteRoomType,
  listRoomTypes,
  updateRoomType,
} from "@/server/modules/rooms/room.service";
import { PERMISSIONS } from "@/server/rbac/permissions";

const createRoomTypeSchema = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().max(500).optional(),
  maxGuests: z.number().int().min(1).max(20),
  baseRate: z.number().min(0),
  extraBedAllowed: z.boolean(),
  extraBedRate: z.number().min(0),
});

const updateRoomTypeSchema = createRoomTypeSchema.partial();

export const GET = withAuth(PERMISSIONS.ROOMS_VIEW, async ({ correlationId }) => {
  const roomTypes = await listRoomTypes();
  return jsonOk({ roomTypes }, correlationId);
});

export const POST = withAuth(PERMISSIONS.ROOMS_MANAGE, async ({ req, user, correlationId }) => {
  const body = await req.json().catch(() => null);
  const parsed = createRoomTypeSchema.safeParse(body);
  if (!parsed.success) throw new ValidationError(parsed.error.message);
  const roomType = await createRoomType(user, parsed.data);
  return jsonOk({ roomType }, correlationId);
});

export const PATCH = withAuth(PERMISSIONS.ROOMS_MANAGE, async ({ req, user, correlationId }) => {
  const roomTypeId = new URL(req.url).searchParams.get("id");
  if (!roomTypeId) throw new ValidationError("id is required.");
  const body = await req.json().catch(() => null);
  const parsed = updateRoomTypeSchema.safeParse(body);
  if (!parsed.success) throw new ValidationError(parsed.error.message);
  const roomType = await updateRoomType(user, roomTypeId, parsed.data);
  return jsonOk({ roomType }, correlationId);
});

export const DELETE = withAuth(PERMISSIONS.ROOMS_DELETE_PERMANENT, async ({ req, user, correlationId }) => {
  const roomTypeId = new URL(req.url).searchParams.get("id");
  if (!roomTypeId) throw new ValidationError("id is required.");
  const result = await deleteRoomType(user, roomTypeId);
  return jsonOk(result, correlationId);
});