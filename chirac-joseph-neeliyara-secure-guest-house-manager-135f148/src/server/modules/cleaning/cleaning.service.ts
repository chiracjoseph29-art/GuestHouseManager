import { prisma } from "@/server/db/prisma";
import { ForbiddenError, NotFoundError, ValidationError } from "@/server/lib/errors";
import { releaseCleaningCompletionPhotos, purgeCleaningTaskPermanent } from "@/server/lib/stored-file-cleanup";
import { writeAuditLog } from "@/server/modules/audit/audit.service";
import type { SessionUser } from "@/server/modules/auth/session.service";
import { deleteStoredFileBlob } from "@/server/modules/files/file.service";
import { assertFileOwnedForPurpose } from "@/server/modules/files/file-policy.service";
import { assertPermission } from "@/server/rbac/authorize";
import { PERMISSIONS } from "@/server/rbac/permissions";

export type CleaningSubmissionMeta = {
  roomCleaned?: boolean;
  inventoryChecked?: boolean;
};

const taskListInclude = {
  room: { select: { id: true, name: true, isActive: true } },
  assignedTo: { select: { id: true, name: true } },
  verifiedBy: { select: { id: true, name: true } },
  photos: { select: { fileId: true }, orderBy: { createdAt: "desc" as const }, take: 1 },
};

export async function listCleaningTasksForUser(user: SessionUser) {
  if (user.role === "ADMIN" || user.role === "MANAGER") {
    return prisma.cleaningTask.findMany({
      orderBy: { dueAt: "asc" },
      include: taskListInclude,
      take: 200,
    });
  }

  return prisma.cleaningTask.findMany({
    where: { assignedToId: user.id },
    orderBy: { dueAt: "asc" },
    include: {
      room: { select: { id: true, name: true, isActive: true } },
      verifiedBy: { select: { id: true, name: true } },
      photos: { select: { fileId: true }, orderBy: { createdAt: "desc" }, take: 1 },
    },
  });
}

export async function getCleaningTask(taskId: string, user: SessionUser) {
  const task = await prisma.cleaningTask.findUnique({
    where: { id: taskId },
    include: {
      room: true,
      photos: { include: { file: true } },
    },
  });
  if (!task) throw new NotFoundError();
  if (user.role === "CLEANER" && task.assignedToId !== user.id) {
    throw new ForbiddenError();
  }
  return task;
}

export async function assignCleaningTask(taskId: string, cleanerId: string, actor: SessionUser) {
  const task = await prisma.cleaningTask.update({
    where: { id: taskId },
    data: { assignedToId: cleanerId, status: "PENDING" },
  });
  await writeAuditLog({
    userId: actor.id,
    action: "cleaning.assigned",
    resourceType: "cleaning_task",
    resourceId: taskId,
    result: "SUCCESS",
    metadata: { cleanerId },
  });
  return task;
}

export async function startCleaningTask(taskId: string, user: SessionUser) {
  const task = await getCleaningTask(taskId, user);
  if (user.role === "CLEANER" && task.assignedToId !== user.id) throw new ForbiddenError();
  if (task.status === "COMPLETED") {
    throw new ValidationError("This task is already completed.");
  }
  if (task.status === "IN_PROGRESS") {
    return task;
  }
  if (task.status !== "PENDING" && task.status !== "ISSUE_REPORTED") {
    throw new ValidationError("This task cannot be started in its current state.");
  }
  const updated = await prisma.cleaningTask.update({
    where: { id: taskId },
    data: { status: "IN_PROGRESS", startedAt: new Date() },
  });
  await writeAuditLog({
    userId: user.id,
    action: "cleaning.started",
    resourceType: "cleaning_task",
    resourceId: taskId,
    result: "SUCCESS",
  });
  return updated;
}

export async function attachCleaningPhoto(taskId: string, fileId: string, user: SessionUser) {
  const task = await getCleaningTask(taskId, user);
  if (user.role === "CLEANER" && task.assignedToId !== user.id) throw new ForbiddenError();
  await assertFileOwnedForPurpose(fileId, user, "CLEANING_PHOTO");
  if (task.status !== "IN_PROGRESS") {
    throw new ValidationError("Start cleaning before uploading a completion photo.");
  }

  await prisma.cleaningPhoto.create({
    data: {
      cleaningTaskId: taskId,
      fileId,
      uploadedById: user.id,
    },
  });

  await writeAuditLog({
    userId: user.id,
    action: "cleaning.photo_uploaded",
    resourceType: "cleaning_task",
    resourceId: taskId,
    result: "SUCCESS",
    metadata: { fileId },
  });
}

export async function submitCleaningForVerification(
  taskId: string,
  user: SessionUser,
  meta?: CleaningSubmissionMeta,
) {
  assertPermission(user, PERMISSIONS.CLEANING_EXECUTE);
  const task = await prisma.cleaningTask.findUnique({
    where: { id: taskId },
    include: { photos: true },
  });
  if (!task) throw new NotFoundError();
  if (user.role === "CLEANER" && task.assignedToId !== user.id) {
    throw new ForbiddenError();
  }
  if (task.status === "COMPLETED") {
    throw new ValidationError("This task is already completed.");
  }
  if (task.status === "AWAITING_VERIFICATION") {
    throw new ValidationError("This task is already awaiting verification.");
  }
  if (task.photos.length === 0) {
    throw new ValidationError("A cleaning photo is required before submission.");
  }
  if (task.status !== "IN_PROGRESS") {
    throw new ValidationError("Start cleaning before submitting for verification.");
  }

  const completionPhotoId = task.photos[task.photos.length - 1].fileId;
  const now = new Date();

  const updated = await prisma.cleaningTask.update({
    where: { id: taskId },
    data: {
      status: "AWAITING_VERIFICATION",
      submittedForVerificationAt: now,
      completionPhotoId,
      submissionMeta: meta ?? { roomCleaned: true, inventoryChecked: true },
    },
  });

  await writeAuditLog({
    userId: user.id,
    action: "cleaning.submitted_for_verification",
    resourceType: "cleaning_task",
    resourceId: taskId,
    result: "SUCCESS",
  });

  return updated;
}

/** @deprecated Use submitCleaningForVerification — kept for test migration alias */
export async function completeCleaningTask(
  taskId: string,
  user: SessionUser,
  meta?: CleaningSubmissionMeta,
) {
  return submitCleaningForVerification(taskId, user, meta);
}

export async function verifyCleaningTask(taskId: string, user: SessionUser) {
  assertPermission(user, PERMISSIONS.CLEANING_VERIFY);
  const task = await prisma.cleaningTask.findUnique({ where: { id: taskId } });
  if (!task) throw new NotFoundError();
  if (task.status !== "AWAITING_VERIFICATION") {
    throw new ValidationError("Only tasks awaiting verification can be verified.");
  }

  const now = new Date();
  const storageKeys = await prisma.$transaction(async (tx) => {
    await tx.cleaningTask.update({
      where: { id: taskId },
      data: {
        status: "COMPLETED",
        verifiedById: user.id,
        verifiedAt: now,
        completedAt: task.completedAt ?? now,
      },
    });
    return releaseCleaningCompletionPhotos(tx, taskId);
  });

  for (const key of storageKeys) {
    await deleteStoredFileBlob(key);
  }

  await writeAuditLog({
    userId: user.id,
    action: "cleaning.verified",
    resourceType: "cleaning_task",
    resourceId: taskId,
    result: "SUCCESS",
    metadata: { roomId: task.roomId },
  });

  return prisma.cleaningTask.findUnique({
    where: { id: taskId },
    include: taskListInclude,
  });
}

export async function reportCleaningVerificationIssue(
  taskId: string,
  user: SessionUser,
  input: { reason: string },
) {
  assertPermission(user, PERMISSIONS.CLEANING_VERIFY);
  const reason = input.reason.trim();
  if (!reason) throw new ValidationError("A reason is required when reporting an issue.");

  const task = await prisma.cleaningTask.findUnique({ where: { id: taskId } });
  if (!task) throw new NotFoundError();
  if (task.status !== "AWAITING_VERIFICATION") {
    throw new ValidationError("Only tasks awaiting verification can be sent back.");
  }

  const updated = await prisma.cleaningTask.update({
    where: { id: taskId },
    data: {
      status: "ISSUE_REPORTED",
      notes: reason,
    },
  });

  await writeAuditLog({
    userId: user.id,
    action: "cleaning.issue_reported",
    resourceType: "cleaning_task",
    resourceId: taskId,
    result: "SUCCESS",
    metadata: { roomId: task.roomId },
  });

  return updated;
}

export async function reportCleaningIssue(
  taskId: string,
  user: SessionUser,
  input: { title: string; description: string; photoFileIds?: string[] },
) {
  const task = await getCleaningTask(taskId, user);
  const issue = await prisma.maintenanceIssue.create({
    data: {
      roomId: task.roomId,
      reportedById: user.id,
      title: input.title,
      description: input.description,
      status: "OPEN",
    },
  });

  if (input.photoFileIds?.length) {
    for (const fileId of input.photoFileIds) {
      await assertFileOwnedForPurpose(fileId, user, "MAINTENANCE_PHOTO");
    }
    await prisma.maintenancePhoto.createMany({
      data: input.photoFileIds.map((fileId) => ({ issueId: issue.id, fileId })),
    });
  }

  await prisma.cleaningTask.update({
    where: { id: taskId },
    data: { status: "ISSUE_REPORTED" },
  });

  return issue;
}

export async function deleteCleaningTaskPermanent(actor: SessionUser, taskId: string) {
  assertPermission(actor, PERMISSIONS.CLEANING_DELETE_PERMANENT);
  const task = await prisma.cleaningTask.findUnique({
    where: { id: taskId },
    include: { room: { select: { id: true, name: true } } },
  });
  if (!task) throw new NotFoundError();

  await prisma.$transaction(async (tx) => {
    await purgeCleaningTaskPermanent(tx, taskId);
  });

  await writeAuditLog({
    userId: actor.id,
    action: "cleaning.deleted",
    resourceType: "cleaning_task",
    resourceId: taskId,
    result: "SUCCESS",
    metadata: { roomId: task.roomId, roomName: task.room.name, status: task.status },
  });

  return { id: taskId, roomId: task.roomId };
}
