import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";
import { ForbiddenError, NotFoundError, ValidationError } from "@/server/lib/errors";
import { writeAuditLog } from "@/server/modules/audit/audit.service";
import type { InventoryTxnType } from "@/generated/prisma/client";
import type { SessionUser } from "@/server/modules/auth/session.service";
import { assertPermission } from "@/server/rbac/authorize";
import { PERMISSIONS } from "@/server/rbac/permissions";

async function assertInventoryAccess(user: SessionUser, action: "view" | "adjust" | "consume") {
  if (user.role === "ADMIN") return;
  if (user.role === "MANAGER") {
    assertPermission(user, action === "view" ? PERMISSIONS.INVENTORY_VIEW : PERMISSIONS.INVENTORY_MANAGE);
    return;
  }
  const perm = await prisma.userInventoryPermission.findUnique({ where: { userId: user.id } });
  if (!perm) throw new ForbiddenError();
  if (action === "view" && !perm.canView) throw new ForbiddenError();
  if (action === "consume" && !perm.canConsume) throw new ForbiddenError();
  if (action === "adjust" && !perm.canAdjust) throw new ForbiddenError();
}

export async function listInventory(user: SessionUser) {
  await assertInventoryAccess(user, "view");
  const items = await prisma.inventoryItem.findMany({
    include: { category: true },
    orderBy: { name: "asc" },
  });
  return items.map((i) => ({
    ...i,
    lowStock: i.quantity <= i.minimumThreshold,
  }));
}

export async function applyInventoryChange(
  itemId: string,
  user: SessionUser,
  input: { type: InventoryTxnType; quantityChange: number; reason: string },
) {
  const needsAdjust = ["ADJUSTMENT", "ADDITION", "DAMAGED", "LOST"].includes(input.type);
  await assertInventoryAccess(user, needsAdjust ? "adjust" : "consume");

  if (!input.reason.trim()) throw new ValidationError("Reason is required.");

  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw(Prisma.sql`SELECT id FROM inventory_items WHERE id = ${itemId}::uuid FOR UPDATE`);
    const item = await tx.inventoryItem.findUnique({ where: { id: itemId } });
    if (!item) throw new NotFoundError();

    const previousQty = item.quantity;
    const newQty = previousQty + input.quantityChange;
    if (newQty < 0 && !item.allowNegative) {
      throw new ValidationError("Insufficient stock.");
    }

    const updated = await tx.inventoryItem.update({
      where: { id: itemId },
      data: { quantity: newQty },
    });

    await tx.inventoryTransaction.create({
      data: {
        itemId,
        type: input.type,
        quantityChange: input.quantityChange,
        previousQty,
        newQty,
        reason: input.reason.trim(),
        performedById: user.id,
      },
    });

    await writeAuditLog({
      userId: user.id,
      action: "inventory.changed",
      resourceType: "inventory_item",
      resourceId: itemId,
      result: "SUCCESS",
      metadata: { type: input.type, previousQty, newQty },
    });

    return updated;
  });
}

export async function createInventoryItem(
  user: SessionUser,
  data: {
    name: string;
    categoryId: string;
    quantity: number;
    minimumThreshold: number;
    unit: string;
    location?: string;
  },
) {
  assertPermission(user, PERMISSIONS.INVENTORY_MANAGE);
  return prisma.inventoryItem.create({ data });
}
