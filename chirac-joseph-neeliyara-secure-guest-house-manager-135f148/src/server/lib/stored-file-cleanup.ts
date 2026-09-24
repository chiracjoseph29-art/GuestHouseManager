import type { Prisma } from "@/generated/prisma/client";

export async function deleteStoredFileIfUnreferenced(
  tx: Prisma.TransactionClient,
  fileId: string,
): Promise<void> {
  const [cleaningPhotos, maintenancePhotos, completionTasks, inventoryItems, verifications] =
    await Promise.all([
      tx.cleaningPhoto.count({ where: { fileId } }),
      tx.maintenancePhoto.count({ where: { fileId } }),
      tx.cleaningTask.count({ where: { completionPhotoId: fileId } }),
      tx.inventoryItem.count({ where: { referencePhotoId: fileId } }),
      tx.inventoryVerification.count({ where: { photoFileId: fileId } }),
    ]);
  if (cleaningPhotos + maintenancePhotos + completionTasks + inventoryItems + verifications > 0) {
    return;
  }
  await tx.storedFile.delete({ where: { id: fileId } }).catch(() => undefined);
}

/** Removes a cleaning task, its photos, and orphan stored files (does not delete the room). */
export async function purgeCleaningTaskPermanent(
  tx: Prisma.TransactionClient,
  taskId: string,
): Promise<void> {
  const task = await tx.cleaningTask.findUnique({
    where: { id: taskId },
    include: { photos: { select: { fileId: true } } },
  });
  if (!task) return;
  const fileIds = new Set(task.photos.map((p) => p.fileId));
  if (task.completionPhotoId) fileIds.add(task.completionPhotoId);
  if (task.completionPhotoId) {
    await tx.cleaningTask.update({
      where: { id: taskId },
      data: { completionPhotoId: null },
    });
  }
  await tx.cleaningPhoto.deleteMany({ where: { cleaningTaskId: taskId } });
  await tx.cleaningTask.delete({ where: { id: taskId } });
  for (const fileId of fileIds) {
    await deleteStoredFileIfUnreferenced(tx, fileId);
  }
}
