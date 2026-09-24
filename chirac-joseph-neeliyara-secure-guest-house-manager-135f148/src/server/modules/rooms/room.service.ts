import { CleaningStatus, Prisma } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";
import { ConflictError, NotFoundError, ValidationError } from "@/server/lib/errors";
import { writeAuditLog } from "@/server/modules/audit/audit.service";
import type { SessionUser } from "@/server/modules/auth/session.service";
import { purgeCleaningTaskPermanent } from "@/server/lib/stored-file-cleanup";
import { assertPermission } from "@/server/rbac/authorize";
import { PERMISSIONS } from "@/server/rbac/permissions";

export async function listRoomsForAdmin() {
  return prisma.room.findMany({
    include: { roomType: true },
    orderBy: { name: "asc" },
  });
}

export async function listActiveRooms() {
  return prisma.room.findMany({
    where: { isActive: true },
    include: { roomType: true },
    orderBy: { name: "asc" },
  });
}

export async function createRoom(
  actor: SessionUser,
  data: { name: string; roomTypeId: string; floor?: string; notes?: string; isActive?: boolean },
) {
  assertPermission(actor, PERMISSIONS.ROOMS_MANAGE);
  const name = data.name.trim();
  if (!name) throw new ValidationError("Room name is required.");

  const dup = await prisma.room.findUnique({ where: { name } });
  if (dup) throw new ConflictError("A room with this name already exists.");

  const roomType = await prisma.roomType.findUnique({ where: { id: data.roomTypeId } });
  if (!roomType) throw new ValidationError("Invalid room type.");

  const room = await prisma.room.create({
    data: {
      name,
      roomTypeId: data.roomTypeId,
      floor: data.floor?.trim(),
      notes: data.notes?.trim(),
      isActive: data.isActive ?? true,
    },
    include: { roomType: true },
  });

  await writeAuditLog({
    userId: actor.id,
    action: "room.created",
    resourceType: "room",
    resourceId: room.id,
    result: "SUCCESS",
    metadata: { name: room.name },
  });

  return room;
}

export async function updateRoom(
  actor: SessionUser,
  roomId: string,
  data: {
    name?: string;
    roomTypeId?: string;
    floor?: string;
    notes?: string;
    isActive?: boolean;
  },
) {
  assertPermission(actor, PERMISSIONS.ROOMS_MANAGE);
  const existing = await prisma.room.findUnique({ where: { id: roomId } });
  if (!existing) throw new NotFoundError();

  if (data.name && data.name.trim() !== existing.name) {
    const dup = await prisma.room.findUnique({ where: { name: data.name.trim() } });
    if (dup) throw new ConflictError("A room with this name already exists.");
  }

  if (data.roomTypeId) {
    const roomType = await prisma.roomType.findUnique({ where: { id: data.roomTypeId } });
    if (!roomType) throw new ValidationError("Invalid room type.");
  }

  const wasActive = existing.isActive;
  const room = await prisma.room.update({
    where: { id: roomId },
    data: {
      name: data.name?.trim() ?? existing.name,
      roomTypeId: data.roomTypeId ?? existing.roomTypeId,
      floor: data.floor !== undefined ? data.floor.trim() || null : existing.floor,
      notes: data.notes !== undefined ? data.notes.trim() || null : existing.notes,
      isActive: data.isActive ?? existing.isActive,
    },
    include: { roomType: true },
  });

  await writeAuditLog({
    userId: actor.id,
    action: "room.updated",
    resourceType: "room",
    resourceId: roomId,
    result: "SUCCESS",
    metadata: { name: room.name },
  });

  if (wasActive && room.isActive === false) {
    await writeAuditLog({
      userId: actor.id,
      action: "room.deactivated",
      resourceType: "room",
      resourceId: roomId,
      result: "SUCCESS",
    });
  } else if (!wasActive && room.isActive === true) {
    await writeAuditLog({
      userId: actor.id,
      action: "room.reactivated",
      resourceType: "room",
      resourceId: roomId,
      result: "SUCCESS",
    });
  }

  return room;
}

export async function listRoomTypes() {
  return prisma.roomType.findMany({ orderBy: { name: "asc" } });
}

export async function updateRoomType(
  actor: SessionUser,
  roomTypeId: string,
  data: {
    baseRate?: number;
    extraBedRate?: number;
    maxGuests?: number;
    extraBedAllowed?: boolean;
    description?: string;
  },
) {
  assertPermission(actor, PERMISSIONS.ROOMS_MANAGE);
  const existing = await prisma.roomType.findUnique({ where: { id: roomTypeId } });
  if (!existing) throw new NotFoundError();

  if (data.baseRate !== undefined && data.baseRate < 0) {
    throw new ValidationError("Base rate cannot be negative.");
  }
  if (data.extraBedRate !== undefined && data.extraBedRate < 0) {
    throw new ValidationError("Extra bed rate cannot be negative.");
  }

  const roomType = await prisma.roomType.update({
    where: { id: roomTypeId },
    data: {
      baseRate: data.baseRate ?? existing.baseRate,
      extraBedRate: data.extraBedRate ?? existing.extraBedRate,
      maxGuests: data.maxGuests ?? existing.maxGuests,
      extraBedAllowed: data.extraBedAllowed ?? existing.extraBedAllowed,
      description: data.description !== undefined ? data.description.trim() || null : existing.description,
    },
  });

  await writeAuditLog({
    userId: actor.id,
    action: "room_type.updated",
    resourceType: "room_type",
    resourceId: roomTypeId,
    result: "SUCCESS",
    metadata: { name: roomType.name, baseRate: Number(roomType.baseRate) },
  });

  return roomType;
}

const REMOVABLE_CLEANING_STATUSES: CleaningStatus[] = [
  CleaningStatus.PENDING,
  CleaningStatus.IN_PROGRESS,
];

export type RoomDeleteBlockers = {
  bookings: number;
  /** Non-pending cleaning tasks that still block deletion (e.g. completed history). */
  cleaningTasks: number;
  roomInventory: number;
  maintenanceIssues: number;
  inventoryVerifications: number;
  inventoryTransactions: number;
};

export async function getRoomDeleteBlockers(roomId: string): Promise<RoomDeleteBlockers> {
  const [bookings, cleaningTasks, roomInventory, maintenanceIssues, inventoryVerifications, inventoryTransactions] =
    await Promise.all([
      prisma.bookingRoom.count({ where: { roomId } }),
      prisma.cleaningTask.count({
        where: { roomId, status: { notIn: REMOVABLE_CLEANING_STATUSES } },
      }),
      prisma.roomInventory.count({ where: { roomId } }),
      prisma.maintenanceIssue.count({ where: { roomId } }),
      prisma.inventoryVerification.count({ where: { roomId } }),
      prisma.inventoryTransaction.count({ where: { roomId } }),
    ]);
  return {
    bookings,
    cleaningTasks,
    roomInventory,
    maintenanceIssues,
    inventoryVerifications,
    inventoryTransactions,
  };
}

async function removeRemovableCleaningTasksForRoom(
  tx: Prisma.TransactionClient,
  roomId: string,
): Promise<void> {
  const tasks = await tx.cleaningTask.findMany({
    where: { roomId, status: { in: REMOVABLE_CLEANING_STATUSES } },
    select: { id: true },
  });
  for (const task of tasks) {
    await purgeCleaningTaskPermanent(tx, task.id);
  }
}

async function assertRoomCleaningDeletable(roomId: string, roomName: string): Promise<void> {
  const completedCount = await prisma.cleaningTask.count({
    where: { roomId, status: CleaningStatus.COMPLETED },
  });
  if (completedCount > 0) {
    throw new ConflictError(
      "This room has completed cleaning history and cannot be permanently deleted. Deactivate it instead.",
    );
  }
  const otherBlocking = await prisma.cleaningTask.count({
    where: {
      roomId,
      status: { notIn: [...REMOVABLE_CLEANING_STATUSES, CleaningStatus.COMPLETED] },
    },
  });
  if (otherBlocking > 0) {
    throw new ConflictError(
      `Room "${roomName}" cannot be deleted yet because it has ${otherBlocking} cleaning task(s) awaiting verification or with reported issues. Resolve those first or deactivate the room instead.`,
    );
  }
}

function formatRoomDeleteBlockers(blockers: RoomDeleteBlockers): string {
  const parts: string[] = [];
  if (blockers.bookings > 0) parts.push(`${blockers.bookings} booking link(s)`);
  if (blockers.cleaningTasks > 0) parts.push(`${blockers.cleaningTasks} cleaning task(s)`);
  if (blockers.roomInventory > 0) parts.push(`${blockers.roomInventory} room inventory assignment(s)`);
  if (blockers.maintenanceIssues > 0) parts.push(`${blockers.maintenanceIssues} maintenance issue(s)`);
  if (blockers.inventoryVerifications > 0) parts.push(`${blockers.inventoryVerifications} inventory verification(s)`);
  if (blockers.inventoryTransactions > 0) parts.push(`${blockers.inventoryTransactions} inventory transaction(s)`);
  return parts.join(", ");
}

export async function deleteRoomPermanent(actor: SessionUser, roomId: string) {
  assertPermission(actor, PERMISSIONS.ROOMS_DELETE_PERMANENT);

  const room = await prisma.room.findUnique({
    where: { id: roomId },
    include: { roomType: { select: { id: true, name: true } } },
  });
  if (!room) throw new NotFoundError();

  await assertRoomCleaningDeletable(roomId, room.name);

  const blockers = await getRoomDeleteBlockers(roomId);
  const total =
    blockers.bookings +
    blockers.cleaningTasks +
    blockers.roomInventory +
    blockers.maintenanceIssues +
    blockers.inventoryVerifications +
    blockers.inventoryTransactions;

  if (total > 0) {
    throw new ConflictError(
      `Room "${room.name}" cannot be deleted yet because it still has: ${formatRoomDeleteBlockers(blockers)}. Remove or reassign those records first. Deactivate the room instead if you only need to stop new bookings.`,
    );
  }

  await prisma.$transaction(async (tx) => {
    await removeRemovableCleaningTasksForRoom(tx, roomId);
    await tx.room.delete({ where: { id: roomId } });
  });

  const roomTypeStillExists = await prisma.roomType.findUnique({
    where: { id: room.roomTypeId },
    select: { id: true },
  });
  if (!roomTypeStillExists) {
    throw new NotFoundError("Room type was unexpectedly removed.");
  }

  await writeAuditLog({
    userId: actor.id,
    action: "room.deleted",
    resourceType: "room",
    resourceId: roomId,
    result: "SUCCESS",
    metadata: { name: room.name, roomTypeId: room.roomTypeId, roomTypeName: room.roomType.name },
  });

  return { id: roomId, name: room.name };
}
