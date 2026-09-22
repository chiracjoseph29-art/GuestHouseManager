import { applyInventoryChange, createInventoryItem, listInventory } from "@/server/modules/inventory/inventory.service";
import { jsonOk, withAuth } from "@/server/http/api-handler";
import { inventoryChangeSchema } from "@/server/http/schemas";
import { PERMISSIONS } from "@/server/rbac/permissions";
import { ValidationError } from "@/server/lib/errors";
import { z } from "zod";

export const GET = withAuth(
  [PERMISSIONS.INVENTORY_VIEW, PERMISSIONS.INVENTORY_ADJUST],
  async ({ user, correlationId }) => {
    const items = await listInventory(user);
    return jsonOk({ items }, correlationId);
  },
  { anyOf: true },
);

export const POST = withAuth(PERMISSIONS.INVENTORY_MANAGE, async ({ req, user, correlationId }) => {
  const body = await req.json().catch(() => null);
  const schema = z.object({
    name: z.string().min(1),
    categoryId: z.string().uuid(),
    quantity: z.number().int().min(0),
    minimumThreshold: z.number().int().min(0),
    unit: z.string().min(1),
    location: z.string().optional(),
  });
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new ValidationError();
  const item = await createInventoryItem(user, parsed.data);
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
