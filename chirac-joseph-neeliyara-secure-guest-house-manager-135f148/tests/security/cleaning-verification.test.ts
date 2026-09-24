import "dotenv/config";
import { describe, expect, it } from "vitest";
import { prisma } from "@/server/db/prisma";
import {
  deleteCleaningTaskPermanent,
  reportCleaningVerificationIssue,
  startCleaningTask,
  submitCleaningForVerification,
  verifyCleaningTask,
} from "@/server/modules/cleaning/cleaning.service";
import { processAndStoreImage } from "@/server/modules/files/file.service";
import { ForbiddenError, ValidationError } from "@/server/lib/errors";
import { minimalJpegBuffer } from "../helpers/minimal-jpeg";

function sessionFromUser(u: { id: string; email: string; name: string; role: "ADMIN" | "MANAGER" | "CLEANER"; canViewFinancials?: boolean }) {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    status: "ACTIVE" as const,
    canViewFinancials: u.canViewFinancials ?? false,
    mfaEnabled: false,
  };
}

async function disposableTask() {
  const room = await prisma.room.findFirst({ where: { isActive: true } });
  expect(room).toBeTruthy();
  const task = await prisma.cleaningTask.create({
    data: { roomId: room!.id, status: "PENDING", dueAt: new Date() },
  });
  return task;
}

async function attachPhoto(taskId: string, userId: string) {
  const admin = await prisma.user.findFirst({ where: { role: "ADMIN" } });
  const jpeg = await minimalJpegBuffer();
  const file = await processAndStoreImage(jpeg, "CLEANING_PHOTO", admin!);
  await prisma.cleaningPhoto.create({
    data: { cleaningTaskId: taskId, fileId: file.fileId, uploadedById: userId },
  });
  return file.fileId;
}

describe("cleaning verification workflow", () => {
  it("cleaner submits for verification and cannot verify", async () => {
    const cleanerRow = await prisma.user.findUnique({ where: { email: "cleaner@guesthouse.local" } });
    if (!cleanerRow) return;
    const cleaner = sessionFromUser({ ...cleanerRow, role: "CLEANER" });
    const task = await disposableTask();
    await prisma.cleaningTask.update({
      where: { id: task.id },
      data: { assignedToId: cleanerRow.id },
    });

    await startCleaningTask(task.id, cleaner);
    await attachPhoto(task.id, cleanerRow.id);
    const submitted = await submitCleaningForVerification(task.id, cleaner);
    expect(submitted.status).toBe("AWAITING_VERIFICATION");

    await expect(verifyCleaningTask(task.id, cleaner)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(deleteCleaningTaskPermanent(cleaner, task.id)).rejects.toBeInstanceOf(ForbiddenError);

    await prisma.cleaningPhoto.deleteMany({ where: { cleaningTaskId: task.id } });
    await prisma.cleaningTask.delete({ where: { id: task.id } });
  });

  it("manager verifies task, records verifier, removes photo when safe", async () => {
    const adminRow = await prisma.user.findFirst({ where: { role: "ADMIN" } });
    const mgrRow = await prisma.user.findFirst({ where: { role: "MANAGER" } });
    if (!adminRow || !mgrRow) return;
    const admin = sessionFromUser({ ...adminRow, role: "ADMIN", canViewFinancials: true });
    const manager = sessionFromUser({ ...mgrRow, role: "MANAGER", canViewFinancials: true });

    const task = await disposableTask();
    await startCleaningTask(task.id, admin);
    const fileId = await attachPhoto(task.id, adminRow.id);
    await submitCleaningForVerification(task.id, admin);

    const verified = await verifyCleaningTask(task.id, manager);
    expect(verified?.status).toBe("COMPLETED");
    expect(verified?.verifiedById).toBe(mgrRow.id);
    expect(verified?.verifiedAt).toBeTruthy();

    const stillThere = await prisma.cleaningTask.findUnique({ where: { id: task.id } });
    expect(stillThere).toBeTruthy();

    const file = await prisma.storedFile.findUnique({ where: { id: fileId } });
    const invRef = await prisma.inventoryVerification.count({ where: { photoFileId: fileId } });
    if (invRef === 0) {
      expect(file).toBeNull();
    }

    const audit = await prisma.auditLog.findFirst({
      where: { action: "cleaning.verified", resourceId: task.id },
      orderBy: { createdAt: "desc" },
    });
    expect(audit).toBeTruthy();

    await prisma.cleaningTask.delete({ where: { id: task.id } });
  });

  it("rejects verify on invalid states", async () => {
    const adminRow = await prisma.user.findFirst({ where: { role: "ADMIN" } });
    if (!adminRow) return;
    const admin = sessionFromUser({ ...adminRow, role: "ADMIN", canViewFinancials: true });
    const task = await disposableTask();
    await expect(verifyCleaningTask(task.id, admin)).rejects.toBeInstanceOf(ValidationError);
    await prisma.cleaningTask.delete({ where: { id: task.id } });
  });

  it("manager can report issue on awaiting task", async () => {
    const adminRow = await prisma.user.findFirst({ where: { role: "ADMIN" } });
    const mgrRow = await prisma.user.findFirst({ where: { role: "MANAGER" } });
    if (!adminRow || !mgrRow) return;
    const admin = sessionFromUser({ ...adminRow, role: "ADMIN", canViewFinancials: true });
    const manager = sessionFromUser({ ...mgrRow, role: "MANAGER", canViewFinancials: true });

    const task = await disposableTask();
    await startCleaningTask(task.id, admin);
    await attachPhoto(task.id, adminRow.id);
    await submitCleaningForVerification(task.id, admin);
    const updated = await reportCleaningVerificationIssue(task.id, manager, { reason: "Missed bathroom" });
    expect(updated.status).toBe("ISSUE_REPORTED");

    const audit = await prisma.auditLog.findFirst({
      where: { action: "cleaning.issue_reported", resourceId: task.id },
      orderBy: { createdAt: "desc" },
    });
    expect(audit).toBeTruthy();

    await prisma.cleaningPhoto.deleteMany({ where: { cleaningTaskId: task.id } });
    await prisma.cleaningTask.delete({ where: { id: task.id } });
  });
});
