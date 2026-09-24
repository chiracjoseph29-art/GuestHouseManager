import "dotenv/config";
import { describe, expect, it } from "vitest";
import { prisma } from "@/server/db/prisma";
import {
  completeCleaningTask,
  verifyCleaningTask,
  startCleaningTask,
} from "@/server/modules/cleaning/cleaning.service";
import { createInventoryItem } from "@/server/modules/inventory/inventory.service";
import {
  removeRoomInventoryConfig,
  setRoomInventoryExpected,
  syncRoomAssignmentsForItem,
  verifyRoomInventoryItem,
} from "@/server/modules/inventory/room-inventory.service";
import { processAndStoreImage } from "@/server/modules/files/file.service";
import { ValidationError } from "@/server/lib/errors";
import { assertPermission } from "@/server/rbac/authorize";
import { PERMISSIONS } from "@/server/rbac/permissions";
import { minimalJpegBuffer } from "../helpers/minimal-jpeg";
import type { SessionUser } from "@/server/modules/auth/session.service";

function sessionFromUser(u: {
  id: string;
  email: string;
  name: string;
  role: "ADMIN" | "CLEANER" | "MANAGER";
  canViewFinancials?: boolean;
}): SessionUser {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    status: "ACTIVE",
    canViewFinancials: u.canViewFinancials ?? false,
    mfaEnabled: false,
  };
}

describe("room inventory and cleaning operations", () => {
  it("admin can pass room inventory manage and verify permissions", () => {
    const admin = { role: "ADMIN" as const, canViewFinancials: false };
    expect(() => assertPermission(admin, PERMISSIONS.INVENTORY_MANAGE)).not.toThrow();
    expect(() => assertPermission(admin, PERMISSIONS.INVENTORY_VERIFY)).not.toThrow();
    expect(() => assertPermission(admin, PERMISSIONS.CLEANING_EXECUTE)).not.toThrow();
  });

  it("syncs room assignments on create without duplicate RoomInventory or InventoryItem rows", async () => {
    const adminRow = await prisma.user.findFirst({ where: { role: "ADMIN" } });
    const category = await prisma.inventoryCategory.findFirst();
    const rooms = await prisma.room.findMany({ take: 2, orderBy: { name: "asc" } });
    expect(adminRow && category && rooms.length >= 2).toBeTruthy();
    const admin = sessionFromUser({ ...adminRow!, role: "ADMIN" });
    const name = `Drinking Glasses Test ${Date.now()}`;
    const item = await createInventoryItem(admin, {
      name,
      categoryId: category!.id,
      quantity: 30,
      minimumThreshold: 5,
      unit: "pieces",
    });
    await syncRoomAssignmentsForItem(admin, item.id, [
      { roomId: rooms[0].id, expectedQuantity: 4 },
      { roomId: rooms[1].id, expectedQuantity: 4 },
    ]);
    const links = await prisma.roomInventory.findMany({ where: { itemId: item.id } });
    expect(links).toHaveLength(2);
    expect(links.every((l) => l.expectedQuantity === 4)).toBe(true);
    expect(await prisma.inventoryItem.count({ where: { name } })).toBe(1);

    await syncRoomAssignmentsForItem(admin, item.id, [{ roomId: rooms[0].id, expectedQuantity: 6 }]);
    const afterEdit = await prisma.roomInventory.findMany({ where: { itemId: item.id } });
    expect(afterEdit).toHaveLength(1);
    expect(afterEdit[0].expectedQuantity).toBe(6);

    await prisma.roomInventory.deleteMany({ where: { itemId: item.id } });
    await prisma.inventoryItem.delete({ where: { id: item.id } });
  });

  it("configuring room inventory does not create duplicate master items", async () => {
    const adminRow = await prisma.user.findFirst({ where: { role: "ADMIN" } });
    const room = await prisma.room.findFirst({ where: { name: "Garden Suite" } });
    const item = await prisma.inventoryItem.findFirst({ where: { name: "Towels" } });
    expect(adminRow && room && item).toBeTruthy();

    const before = await prisma.inventoryItem.count();
    const actor = sessionFromUser({ ...adminRow!, role: "ADMIN" });
    await setRoomInventoryExpected(actor, room!.id, item!.id, 4);
    const after = await prisma.inventoryItem.count();
    expect(after).toBe(before);

    const link = await prisma.roomInventory.findUnique({
      where: { roomId_itemId: { roomId: room!.id, itemId: item!.id } },
    });
    expect(link?.expectedQuantity).toBe(4);

    await removeRoomInventoryConfig(actor, room!.id, item!.id);
  });

  it("admin and cleaner can record room inventory verification", async () => {
    const adminRow = await prisma.user.findFirst({ where: { role: "ADMIN" } });
    const cleanerRow = await prisma.user.findUnique({ where: { email: "cleaner@guesthouse.local" } });
    const room = await prisma.room.findFirst();
    const item = await prisma.inventoryItem.findFirst();
    expect(adminRow && cleanerRow && room && item).toBeTruthy();

    const admin = sessionFromUser({ ...adminRow!, role: "ADMIN" });
    await setRoomInventoryExpected(admin, room!.id, item!.id, 2);

    const jpeg = await minimalJpegBuffer();
    const adminFile = await processAndStoreImage(jpeg, "INVENTORY_VERIFICATION", adminRow!);
    const verification = await verifyRoomInventoryItem(admin, {
      roomId: room!.id,
      itemId: item!.id,
      foundQuantity: 2,
      photoFileId: adminFile.fileId,
    });
    expect(verification.status).toBe("VERIFIED");

    const cleanerFile = await processAndStoreImage(jpeg, "INVENTORY_VERIFICATION", cleanerRow!);
    const cleaner = sessionFromUser({ ...cleanerRow!, role: "CLEANER" });
    const cleanerVerification = await verifyRoomInventoryItem(cleaner, {
      roomId: room!.id,
      itemId: item!.id,
      foundQuantity: 1,
      photoFileId: cleanerFile.fileId,
    });
    expect(cleanerVerification.status).toBe("MISSING");
    expect(cleanerVerification.expectedQuantity).toBe(2);
    expect(cleanerVerification.foundQuantity).toBe(1);

    await removeRoomInventoryConfig(admin, room!.id, item!.id);
  });

  it("admin can start cleaning; completion requires a photo", async () => {
    const adminRow = await prisma.user.findFirst({ where: { role: "ADMIN" } });
    expect(adminRow).toBeTruthy();
    const admin = sessionFromUser({ ...adminRow!, role: "ADMIN" });

    const task = await prisma.cleaningTask.create({
      data: {
        roomId: (await prisma.room.findFirstOrThrow()).id,
        status: "PENDING",
        dueAt: new Date(),
      },
    });

    await startCleaningTask(task.id, admin);

    await expect(completeCleaningTask(task.id, admin)).rejects.toThrow(ValidationError);

    const jpeg = await minimalJpegBuffer();
    const file = await processAndStoreImage(jpeg, "CLEANING_PHOTO", adminRow!);
    await prisma.cleaningPhoto.create({
      data: { cleaningTaskId: task.id, fileId: file.fileId, uploadedById: admin.id },
    });

    const submitted = await completeCleaningTask(task.id, admin);
    expect(submitted.status).toBe("AWAITING_VERIFICATION");
    const completed = await verifyCleaningTask(task.id, admin);
    expect(completed?.status).toBe("COMPLETED");

    await prisma.cleaningPhoto.deleteMany({ where: { cleaningTaskId: task.id } });
    await prisma.cleaningTask.delete({ where: { id: task.id } });
  });

  it("cleaner can complete assigned cleaning when photo is attached", async () => {
    const cleanerRow = await prisma.user.findUnique({ where: { email: "cleaner@guesthouse.local" } });
    expect(cleanerRow).toBeTruthy();
    const cleaner = sessionFromUser({ ...cleanerRow!, role: "CLEANER" });

    const task = await prisma.cleaningTask.findFirst({
      where: { assignedToId: cleanerRow!.id, status: "PENDING" },
    });
    if (!task) return;

    await startCleaningTask(task.id, cleaner);
    const jpeg = await minimalJpegBuffer();
    const file = await processAndStoreImage(jpeg, "CLEANING_PHOTO", cleanerRow!);
    await prisma.cleaningPhoto.create({
      data: { cleaningTaskId: task.id, fileId: file.fileId, uploadedById: cleaner.id },
    });
    const submitted = await completeCleaningTask(task.id, cleaner);
    expect(submitted.status).toBe("AWAITING_VERIFICATION");
    const adminRow = await prisma.user.findFirst({ where: { role: "ADMIN" } });
    const completed = await verifyCleaningTask(task.id, sessionFromUser({ ...adminRow!, role: "ADMIN" }));
    expect(completed?.status).toBe("COMPLETED");

    await prisma.cleaningTask.update({
      where: { id: task.id },
      data: { status: "PENDING", completedAt: null, completionPhotoId: null, startedAt: null },
    });
    await prisma.cleaningPhoto.deleteMany({ where: { cleaningTaskId: task.id } });
  });
});
