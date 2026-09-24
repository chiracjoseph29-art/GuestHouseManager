import {
  assignStockToRoom,
  listOpenDiscrepancies,
  listRoomInventory,
  listVerificationHistory,
  resolveDiscrepancy,
  removeRoomInventoryConfig,
  returnStockFromRoom,
  setRoomInventoryExpected,
  verifyRoomInventoryItem,
} from "@/server/modules/inventory/room-inventory.service";
import { attachInventoryReferencePhoto } from "@/server/modules/inventory/room-inventory.service";
import { jsonOk, withAuth } from "@/server/http/api-handler";
import { PERMISSIONS } from "@/server/rbac/permissions";
import { ValidationError } from "@/server/lib/errors";
import { z } from "zod";

export const GET = withAuth(
  [PERMISSIONS.INVENTORY_VIEW, PERMISSIONS.INVENTORY_VERIFY],
  async ({ req, user, correlationId }) => {
    const url = new URL(req.url);
    const roomId = url.searchParams.get("roomId");
    const itemId = url.searchParams.get("itemId");
    if (url.searchParams.get("discrepancies") === "1") {
      const rows = await listOpenDiscrepancies(user);
      return jsonOk({ discrepancies: rows }, correlationId);
    }
    if (roomId && itemId) {
      const history = await listVerificationHistory(roomId, itemId, user);
      return jsonOk({ history }, correlationId);
    }
    if (!roomId) throw new ValidationError("roomId is required.");
    const rows = await listRoomInventory(roomId, user);
    return jsonOk({ roomInventory: rows }, correlationId);
  },
  { anyOf: true },
);

export const POST = withAuth(
  [PERMISSIONS.INVENTORY_MANAGE, PERMISSIONS.INVENTORY_VERIFY],
  async ({ req, user, correlationId }) => {
    const body = await req.json().catch(() => null);
    const action = body?.action as string;
    if (action === "remove_config") {
      const parsed = z
        .object({
          roomId: z.string().uuid(),
          itemId: z.string().uuid(),
        })
        .safeParse(body);
      if (!parsed.success) throw new ValidationError();
      await removeRoomInventoryConfig(user, parsed.data.roomId, parsed.data.itemId);
      return jsonOk({ ok: true }, correlationId);
    }
    if (action === "set_expected") {
      const parsed = z
        .object({
          roomId: z.string().uuid(),
          itemId: z.string().uuid(),
          expectedQuantity: z.number().int().min(0),
        })
        .safeParse(body);
      if (!parsed.success) throw new ValidationError();
      const row = await setRoomInventoryExpected(
        user,
        parsed.data.roomId,
        parsed.data.itemId,
        parsed.data.expectedQuantity,
      );
      return jsonOk({ row }, correlationId);
    }
    if (action === "assign_stock") {
      const parsed = z
        .object({
          roomId: z.string().uuid(),
          itemId: z.string().uuid(),
          quantity: z.number().int().positive(),
          reason: z.string().min(1),
        })
        .safeParse(body);
      if (!parsed.success) throw new ValidationError();
      const row = await assignStockToRoom(
        user,
        parsed.data.roomId,
        parsed.data.itemId,
        parsed.data.quantity,
        parsed.data.reason,
      );
      return jsonOk({ row }, correlationId);
    }
    if (action === "return_stock") {
      const parsed = z
        .object({
          roomId: z.string().uuid(),
          itemId: z.string().uuid(),
          quantity: z.number().int().positive(),
          reason: z.string().min(1),
        })
        .safeParse(body);
      if (!parsed.success) throw new ValidationError();
      const row = await returnStockFromRoom(
        user,
        parsed.data.roomId,
        parsed.data.itemId,
        parsed.data.quantity,
        parsed.data.reason,
      );
      return jsonOk({ row }, correlationId);
    }
    if (action === "attach_reference_photo") {
      const parsed = z.object({ itemId: z.string().uuid(), fileId: z.string().uuid() }).safeParse(body);
      if (!parsed.success) throw new ValidationError();
      const item = await attachInventoryReferencePhoto(user, parsed.data.itemId, parsed.data.fileId);
      return jsonOk({ item }, correlationId);
    }
    if (action === "verify") {
      const parsed = z
        .object({
          roomId: z.string().uuid(),
          itemId: z.string().uuid(),
          foundQuantity: z.number().int().min(0),
          photoFileId: z.string().uuid(),
          notes: z.string().max(2000).optional(),
          cleaningTaskId: z.string().uuid().optional(),
        })
        .safeParse(body);
      if (!parsed.success) throw new ValidationError();
      const verification = await verifyRoomInventoryItem(user, parsed.data);
      return jsonOk({ verification }, correlationId);
    }
    throw new ValidationError("Unknown action.");
  },
  { anyOf: true },
);

export const PATCH = withAuth(PERMISSIONS.INVENTORY_MANAGE, async ({ req, user, correlationId }) => {
  const body = await req.json().catch(() => null);
  const parsed = z
    .object({
      verificationId: z.string().uuid(),
      resolution: z.enum(["RESOLVED", "DISMISSED"]),
    })
    .safeParse(body);
  if (!parsed.success) throw new ValidationError();
  const row = await resolveDiscrepancy(user, parsed.data.verificationId, parsed.data.resolution);
  return jsonOk({ verification: row }, correlationId);
});
