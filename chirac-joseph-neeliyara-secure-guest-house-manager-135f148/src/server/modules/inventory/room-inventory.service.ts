import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";
import { ForbiddenError, NotFoundError, ValidationError } from "@/server/lib/errors";
import { writeAuditLog } from "@/server/modules/audit/audit.service";
import {
  assertFileOwnedForPurpose,
  assertVerificationPhotoFile,
} from "@/server/modules/files/file-policy.service";
import type { SessionUser } from "@/server/modules/auth/session.service";
import { assertPermission } from "@/server/rbac/authorize";
import { PERMISSIONS } from "@/server/rbac/permissions";

export async function setRoomInventoryExpected(
  actor: SessionUser,
  roomId: string,
  itemId: string,
  expectedQuantity: number,
) {
  assertPermission(actor, PERMISSIONS.INVENTORY_MANAGE);
  if (expectedQuantity < 0) throw new ValidationError("Expected quantity cannot be negative.");

  const room = await prisma.room.findUnique({ where: { id: roomId } });
  if (!room) throw new NotFoundError();
  const item = await prisma.inventoryItem.findUnique({ where: { id: itemId } });
  if (!item) throw new NotFoundError();

  const row = await prisma.roomInventory.upsert({
    where: { roomId_itemId: { roomId, itemId } },
    create: { roomId, itemId, expectedQuantity },
    update: { expectedQuantity },
  });

  await writeAuditLog({
    userId: actor.id,
    action: "inventory.assigned_to_room",
    resourceType: "room_inventory",
    resourceId: row.id,
    result: "SUCCESS",
    metadata: { roomId, itemId, expectedQuantity },
  });

  return row;
}

export async function listRoomAssignmentsForItem(actor: SessionUser, itemId: string) {
  assertPermission(actor, PERMISSIONS.INVENTORY_MANAGE);
  const item = await prisma.inventoryItem.findUnique({ where: { id: itemId } });
  if (!item) throw new NotFoundError();
  const rows = await prisma.roomInventory.findMany({
    where: { itemId },
    include: { room: { select: { id: true, name: true, isActive: true } } },
    orderBy: { room: { name: "asc" } },
  });
  return rows.map((r) => ({
    roomId: r.roomId,
    roomName: r.room.name,
    isActive: r.room.isActive,
    expectedQuantity: r.expectedQuantity,
    assignedQuantity: r.assignedQuantity,
  }));
}

/** Upsert expected quantities for selected rooms and remove unchecked rooms (when allowed). */
export async function syncRoomAssignmentsForItem(
  actor: SessionUser,
  itemId: string,
  assignments: { roomId: string; expectedQuantity: number }[],
) {
  assertPermission(actor, PERMISSIONS.INVENTORY_MANAGE);
  const item = await prisma.inventoryItem.findUnique({ where: { id: itemId } });
  if (!item) throw new NotFoundError();

  const desired = new Map<string, number>();
  for (const a of assignments) {
    if (a.expectedQuantity < 0) throw new ValidationError("Expected quantity cannot be negative.");
    desired.set(a.roomId, a.expectedQuantity);
  }

  const existing = await prisma.roomInventory.findMany({ where: { itemId } });

  for (const [roomId, expectedQuantity] of desired) {
    await setRoomInventoryExpected(actor, roomId, itemId, expectedQuantity);
  }

  for (const row of existing) {
    if (!desired.has(row.roomId)) {
      await removeRoomInventoryConfig(actor, row.roomId, itemId);
    }
  }
}

export async function removeRoomInventoryConfig(actor: SessionUser, roomId: string, itemId: string) {
  assertPermission(actor, PERMISSIONS.INVENTORY_MANAGE);
  const row = await prisma.roomInventory.findUnique({
    where: { roomId_itemId: { roomId, itemId } },
  });
  if (!row) throw new NotFoundError();
  if (row.assignedQuantity > 0) {
    throw new ValidationError(
      "Return assigned stock to general inventory before removing this item from the room.",
    );
  }
  await prisma.roomInventory.delete({ where: { id: row.id } });
  await writeAuditLog({
    userId: actor.id,
    action: "inventory.removed_from_room",
    resourceType: "room_inventory",
    resourceId: row.id,
    result: "SUCCESS",
    metadata: { roomId, itemId },
  });
}

export async function assignStockToRoom(
  actor: SessionUser,
  roomId: string,
  itemId: string,
  quantity: number,
  reason: string,
) {
  assertPermission(actor, PERMISSIONS.INVENTORY_MANAGE);
  if (quantity <= 0) throw new ValidationError("Quantity must be positive.");
  if (!reason.trim()) throw new ValidationError("Reason is required.");

  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw(Prisma.sql`SELECT id FROM inventory_items WHERE id = ${itemId}::uuid FOR UPDATE`);
    const item = await tx.inventoryItem.findUnique({ where: { id: itemId } });
    if (!item) throw new NotFoundError();
    if (item.quantity < quantity && !item.allowNegative) {
      throw new ValidationError("Insufficient general stock.");
    }

    const roomRow = await tx.roomInventory.upsert({
      where: { roomId_itemId: { roomId, itemId } },
      create: { roomId, itemId, expectedQuantity: 0, assignedQuantity: quantity },
      update: { assignedQuantity: { increment: quantity } },
    });

    const previousQty = item.quantity;
    const newQty = previousQty - quantity;
    await tx.inventoryItem.update({ where: { id: itemId }, data: { quantity: newQty } });
    await tx.inventoryTransaction.create({
      data: {
        itemId,
        roomId,
        type: "ASSIGNED_TO_ROOM",
        quantityChange: -quantity,
        previousQty,
        newQty,
        reason: reason.trim(),
        performedById: actor.id,
      },
    });

    await writeAuditLog({
      userId: actor.id,
      action: "inventory.assigned_to_room",
      resourceType: "inventory_item",
      resourceId: itemId,
      result: "SUCCESS",
      metadata: { roomId, quantity },
    });

    return roomRow;
  });
}

export async function returnStockFromRoom(
  actor: SessionUser,
  roomId: string,
  itemId: string,
  quantity: number,
  reason: string,
) {
  assertPermission(actor, PERMISSIONS.INVENTORY_MANAGE);
  if (quantity <= 0) throw new ValidationError("Quantity must be positive.");
  if (!reason.trim()) throw new ValidationError("Reason is required.");

  return prisma.$transaction(async (tx) => {
    const roomRow = await tx.roomInventory.findUnique({ where: { roomId_itemId: { roomId, itemId } } });
    if (!roomRow || roomRow.assignedQuantity < quantity) {
      throw new ValidationError("Not enough quantity assigned to this room.");
    }

    await tx.$queryRaw(Prisma.sql`SELECT id FROM inventory_items WHERE id = ${itemId}::uuid FOR UPDATE`);
    const item = await tx.inventoryItem.findUnique({ where: { id: itemId } });
    if (!item) throw new NotFoundError();

    await tx.roomInventory.update({
      where: { id: roomRow.id },
      data: { assignedQuantity: { decrement: quantity } },
    });

    const previousQty = item.quantity;
    const newQty = previousQty + quantity;
    await tx.inventoryItem.update({ where: { id: itemId }, data: { quantity: newQty } });
    await tx.inventoryTransaction.create({
      data: {
        itemId,
        roomId,
        type: "RETURNED_FROM_ROOM",
        quantityChange: quantity,
        previousQty,
        newQty,
        reason: reason.trim(),
        performedById: actor.id,
      },
    });

    await writeAuditLog({
      userId: actor.id,
      action: "inventory.returned_from_room",
      resourceType: "inventory_item",
      resourceId: itemId,
      result: "SUCCESS",
      metadata: { roomId, quantity },
    });

    return roomRow;
  });
}

export async function attachInventoryReferencePhoto(actor: SessionUser, itemId: string, fileId: string) {
  assertPermission(actor, PERMISSIONS.INVENTORY_MANAGE);
  await assertFileOwnedForPurpose(fileId, actor, "INVENTORY_REFERENCE", { allowInventoryLink: true });
  const item = await prisma.inventoryItem.update({
    where: { id: itemId },
    data: { referencePhotoId: fileId },
  });
  await writeAuditLog({
    userId: actor.id,
    action: "inventory.photo.uploaded",
    resourceType: "inventory_item",
    resourceId: itemId,
    result: "SUCCESS",
    metadata: { fileId },
  });
  return item;
}

export async function listRoomInventory(roomId: string, actor: SessionUser) {
  if (actor.role === "CLEANER") {
    assertPermission(actor, PERMISSIONS.INVENTORY_VERIFY);
  } else {
    assertPermission(actor, PERMISSIONS.INVENTORY_VIEW);
  }

  const rows = await prisma.roomInventory.findMany({
    where: { roomId },
    include: {
      item: { include: { referencePhoto: true, category: true } },
      room: { select: { id: true, name: true, isActive: true } },
    },
    orderBy: { item: { name: "asc" } },
  });
  return rows;
}

export async function verifyRoomInventoryItem(
  actor: SessionUser,
  input: {
    roomId: string;
    itemId: string;
    foundQuantity: number;
    photoFileId: string;
    notes?: string;
    cleaningTaskId?: string;
  },
) {
  assertPermission(actor, PERMISSIONS.INVENTORY_VERIFY);
  if (input.foundQuantity < 0) throw new ValidationError("Found quantity cannot be negative.");

  const row = await prisma.roomInventory.findUnique({
    where: { roomId_itemId: { roomId: input.roomId, itemId: input.itemId } },
  });
  if (!row) throw new ValidationError("This item is not configured for the room.");

  await assertVerificationPhotoFile(input.photoFileId, actor, input.cleaningTaskId);

  const expected = row.expectedQuantity;
  const found = input.foundQuantity;
  let status: "VERIFIED" | "MISSING" | "DAMAGED" | "MISMATCH" = "VERIFIED";
  if (found < expected) status = "MISSING";
  else if (found > expected) status = "MISMATCH";

  const verification = await prisma.inventoryVerification.create({
    data: {
      roomId: input.roomId,
      itemId: input.itemId,
      expectedQuantity: expected,
      foundQuantity: found,
      status,
      photoFileId: input.photoFileId,
      verifiedById: actor.id,
      notes: input.notes?.trim(),
      discrepancyStatus: status === "VERIFIED" ? "RESOLVED" : "OPEN",
    },
    include: {
      verifiedBy: { select: { id: true, name: true } },
      item: { select: { name: true } },
    },
  });

  await writeAuditLog({
    userId: actor.id,
    action: status === "VERIFIED" ? "inventory.verified" : "inventory.discrepancy",
    resourceType: "inventory_verification",
    resourceId: verification.id,
    result: "SUCCESS",
    metadata: { roomId: input.roomId, itemId: input.itemId, expected, found, status },
  });

  await writeAuditLog({
    userId: actor.id,
    action: "inventory.verification_photo.uploaded",
    resourceType: "stored_file",
    resourceId: input.photoFileId,
    result: "SUCCESS",
    metadata: { verificationId: verification.id },
  });

  return verification;
}

export async function listVerificationHistory(roomId: string, itemId: string, actor: SessionUser) {
  assertPermission(actor, PERMISSIONS.INVENTORY_VIEW);
  return prisma.inventoryVerification.findMany({
    where: { roomId, itemId },
    orderBy: { createdAt: "desc" },
    include: { verifiedBy: { select: { name: true } }, photo: { select: { id: true } } },
    take: 100,
  });
}

export async function listOpenDiscrepancies(actor: SessionUser) {
  assertPermission(actor, PERMISSIONS.INVENTORY_MANAGE);
  return prisma.inventoryVerification.findMany({
    where: { discrepancyStatus: "OPEN", status: { not: "VERIFIED" } },
    orderBy: { createdAt: "desc" },
    include: {
      room: { select: { name: true } },
      item: { select: { name: true } },
      verifiedBy: { select: { name: true } },
    },
    take: 200,
  });
}

export async function resolveDiscrepancy(
  actor: SessionUser,
  verificationId: string,
  resolution: "RESOLVED" | "DISMISSED",
) {
  assertPermission(actor, PERMISSIONS.INVENTORY_MANAGE);
  const updated = await prisma.inventoryVerification.update({
    where: { id: verificationId },
    data: {
      discrepancyStatus: resolution,
      resolvedAt: new Date(),
      resolvedById: actor.id,
    },
  });
  await writeAuditLog({
    userId: actor.id,
    action: "inventory.adjusted",
    resourceType: "inventory_verification",
    resourceId: verificationId,
    result: "SUCCESS",
    metadata: { resolution },
  });
  return updated;
}
