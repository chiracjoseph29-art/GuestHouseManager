import {
  applyInventoryChange,
  createInventoryItem,
  listInventory,
  updateInventoryItem,
} from "@/server/modules/inventory/inventory.service";
import {
  listRoomAssignmentsForItem,
  syncRoomAssignmentsForItem,
} from "@/server/modules/inventory/room-inventory.service";
import { assertPermission } from "@/server/rbac/authorize";
import { jsonOk, withAuth } from "@/server/http/api-handler";
import { inventoryChangeSchema } from "@/server/http/schemas";
import { PERMISSIONS } from "@/server/rbac/permissions";
import { ValidationError } from "@/server/lib/errors";
import { z } from "zod";

const roomAssignmentSchema = z.array(
  z.object({
    roomId: z.string().uuid(),
    expectedQuantity: z.number().int().min(0),
  }),
);

export const GET = withAuth(PERMISSIONS.INVENTORY_VIEW, async ({ req, user, correlationId }) => {
  const itemId = new URL(req.url).searchParams.get("itemId");
  if (itemId) {
    assertPermission(user, PERMISSIONS.INVENTORY_MANAGE);
    const assignments = await listRoomAssignmentsForItem(user, itemId);
    return jsonOk({ assignments }, correlationId);
  }
  const { items, categories } = await listInventory(user);
  return jsonOk({ items, categories }, correlationId);
});

export const POST = withAuth(PERMISSIONS.INVENTORY_MANAGE, async ({ req, user, correlationId }) => {
  const body = await req.json().catch(() => null);
  const schema = z.object({
    name: z.string().min(1),
    categoryId: z.string().uuid(),
    quantity: z.number().int().min(0),
    minimumThreshold: z.number().int().min(0),
    unit: z.string().min(1),
    location: z.string().optional(),
    roomAssignments: roomAssignmentSchema.optional(),
  });
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new ValidationError();
  const { roomAssignments, ...itemData } = parsed.data;
  const item = await createInventoryItem(user, itemData);
  if (roomAssignments?.length) {
    await syncRoomAssignmentsForItem(user, item.id, roomAssignments);
  }
  return jsonOk({ item }, correlationId);
});

export const PATCH = withAuth(
  [PERMISSIONS.INVENTORY_ADJUST, PERMISSIONS.INVENTORY_MANAGE],
  async ({ req, user, correlationId }) => {
    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    if (!id) throw new ValidationError("id is required.");
    const body = await req.json().catch(() => null);
    const parsed = inventoryChangeSchema.safeParse(body);
    if (!parsed.success) throw new ValidationError();
    const item = await applyInventoryChange(id, user, parsed.data);
    return jsonOk({ item }, correlationId);
  },
  { anyOf: true },
);

export const PUT = withAuth(PERMISSIONS.INVENTORY_MANAGE, async ({ req, user, correlationId }) => {
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) throw new ValidationError("id is required.");
  const body = await req.json().catch(() => null);
  const schema = z.object({
    name: z.string().min(1).optional(),
    categoryId: z.string().uuid().optional(),
    minimumThreshold: z.number().int().min(0).optional(),
    unit: z.string().min(1).optional(),
    location: z.string().max(200).optional(),
    roomAssignments: roomAssignmentSchema.optional(),
  });
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new ValidationError();
  const { roomAssignments, ...itemData } = parsed.data;
  const item = await updateInventoryItem(user, id, itemData);
  if (roomAssignments) {
    await syncRoomAssignmentsForItem(user, id, roomAssignments);
  }
  return jsonOk({ item }, correlationId);
});
