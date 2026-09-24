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

  if (action === "view") {
    try {
      assertPermission(user, PERMISSIONS.INVENTORY_VIEW);
      return;
    } catch {
      /* fall through to per-user inventory grants */
    }
  } else if (user.role === "MANAGER") {
    assertPermission(user, PERMISSIONS.INVENTORY_MANAGE);
    return;
  }

  const perm = await prisma.userInventoryPermission.findUnique({ where: { userId: user.id } });
  if (!perm) throw new ForbiddenError();
  if (action === "view" && !perm.canView) throw new ForbiddenError();
  if (action === "consume" && !perm.canConsume) throw new ForbiddenError();
  if (action === "adjust" && !perm.canAdjust) throw new ForbiddenError();
}

function serializeInventoryItem(
  i: {
    id: string;
    name: string;
    categoryId: string;
    quantity: number;
    minimumThreshold: number;
    unit: string;
    location: string | null;
    allowNegative: boolean;
    referencePhotoId: string | null;
    createdAt: Date;
    updatedAt: Date;
    category: { id: string; name: string };
    referencePhoto: { id: string } | null;
  },
  assignedQty: number,
) {
  return {
    id: i.id,
    name: i.name,
    categoryId: i.categoryId,
    quantity: i.quantity,
    minimumThreshold: i.minimumThreshold,
    unit: i.unit,
    location: i.location,
    allowNegative: i.allowNegative,
    referencePhotoId: i.referencePhotoId ?? i.referencePhoto?.id ?? null,
    createdAt: i.createdAt.toISOString(),
    updatedAt: i.updatedAt.toISOString(),
    category: i.category ? { id: i.category.id, name: i.category.name } : null,
    assignedQuantity: assignedQty,
    availableQuantity: i.quantity,
    lowStock: i.quantity <= i.minimumThreshold,
  };
}

async function loadAssignedQuantities(): Promise<Map<string, number>> {
  try {
    const assigned = await prisma.roomInventory.groupBy({
      by: ["itemId"],
      _sum: { assignedQuantity: true },
    });
    return new Map(assigned.map((a) => [a.itemId, a._sum.assignedQuantity ?? 0]));
  } catch {
    return new Map();
  }
}

export async function listInventory(user: SessionUser) {
  await assertInventoryAccess(user, "view");
  const [items, categories, assignedMap] = await Promise.all([
    prisma.inventoryItem.findMany({
      include: { category: true, referencePhoto: { select: { id: true } } },
      orderBy: { name: "asc" },
    }),
    prisma.inventoryCategory.findMany({ orderBy: { name: "asc" } }),
    loadAssignedQuantities(),
  ]);
  return {
    items: items.map((i) => serializeInventoryItem(i, assignedMap.get(i.id) ?? 0)),
    categories: categories.map((c) => ({ id: c.id, name: c.name })),
  };
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
  const item = await prisma.inventoryItem.create({ data });
  await writeAuditLog({
    userId: user.id,
    action: "inventory.created",
    resourceType: "inventory_item",
    resourceId: item.id,
    result: "SUCCESS",
    metadata: { name: item.name },
  });
  return item;
}

export async function updateInventoryItem(
  user: SessionUser,
  itemId: string,
  data: {
    name?: string;
    categoryId?: string;
    minimumThreshold?: number;
    unit?: string;
    location?: string;
  },
) {
  assertPermission(user, PERMISSIONS.INVENTORY_MANAGE);
  const existing = await prisma.inventoryItem.findUnique({ where: { id: itemId } });
  if (!existing) throw new NotFoundError();

  const item = await prisma.inventoryItem.update({
    where: { id: itemId },
    data: {
      name: data.name?.trim() ?? existing.name,
      categoryId: data.categoryId ?? existing.categoryId,
      minimumThreshold: data.minimumThreshold ?? existing.minimumThreshold,
      unit: data.unit?.trim() ?? existing.unit,
      location: data.location !== undefined ? data.location.trim() || null : existing.location,
    },
  });

  await writeAuditLog({
    userId: user.id,
    action: "inventory.updated",
    resourceType: "inventory_item",
    resourceId: itemId,
    result: "SUCCESS",
    metadata: { name: item.name },
  });

  return item;
}
