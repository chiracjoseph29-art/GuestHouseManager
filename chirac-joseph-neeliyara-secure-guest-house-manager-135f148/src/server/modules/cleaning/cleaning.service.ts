import { prisma } from "@/server/db/prisma";
import { ForbiddenError, NotFoundError, ValidationError } from "@/server/lib/errors";
import { writeAuditLog } from "@/server/modules/audit/audit.service";
import type { SessionUser } from "@/server/modules/auth/session.service";
import { assertFileOwnedForPurpose } from "@/server/modules/files/file-policy.service";

export async function listCleaningTasksForUser(user: SessionUser) {
  if (user.role === "ADMIN" || user.role === "MANAGER") {
    return prisma.cleaningTask.findMany({
      orderBy: { dueAt: "asc" },
      include: {
        room: { select: { id: true, name: true, isActive: true } },
        assignedTo: { select: { id: true, name: true } },
        photos: { select: { fileId: true }, orderBy: { createdAt: "desc" }, take: 1 },
      },
      take: 200,
    });
  }

  return prisma.cleaningTask.findMany({
    where: { assignedToId: user.id },
    orderBy: { dueAt: "asc" },
    include: {
      room: { select: { id: true, name: true, isActive: true } },
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
  if (task.status !== "PENDING") {
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

export async function completeCleaningTask(taskId: string, user: SessionUser) {
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

  if (task.photos.length === 0) {
    throw new ValidationError("A cleaning photo is required before completion.");
  }
  if (task.status !== "IN_PROGRESS") {
    throw new ValidationError("Start cleaning before completing the task.");
  }

  const completionPhotoId = task.photos[task.photos.length - 1].fileId;

  const updated = await prisma.cleaningTask.update({
    where: { id: taskId },
    data: {
      status: "COMPLETED",
      completedAt: new Date(),
      completionPhotoId,
    },
  });

  await writeAuditLog({
    userId: user.id,
    action: "cleaning.completed",
    resourceType: "cleaning_task",
    resourceId: taskId,
    result: "SUCCESS",
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
