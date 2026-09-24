import { prisma } from "@/server/db/prisma";
import { ForbiddenError, ValidationError } from "@/server/lib/errors";
import type { FilePurpose } from "@/generated/prisma/client";
import type { SessionUser } from "@/server/modules/auth/session.service";

export async function assertFileOwnedForPurpose(
  fileId: string,
  user: SessionUser,
  purpose: FilePurpose,
  options?: { allowInventoryLink?: boolean },
): Promise<void> {
  const file = await prisma.storedFile.findUnique({ where: { id: fileId } });
  if (!file) throw new ValidationError("Invalid file reference.");
  if (file.uploadedById !== user.id) {
    throw new ForbiddenError();
  }
  if (file.purpose !== purpose) {
    throw new ValidationError("Invalid file reference.");
  }

  const alreadyLinked = await prisma.cleaningPhoto.findFirst({ where: { fileId } });
  if (alreadyLinked) {
    throw new ValidationError("File is already linked to a task.");
  }
  const linkedMaintenance = await prisma.maintenancePhoto.findFirst({ where: { fileId } });
  if (linkedMaintenance) {
    throw new ValidationError("File is already linked.");
  }

  if (!options?.allowInventoryLink) {
    const linkedVerification = await prisma.inventoryVerification.findFirst({ where: { photoFileId: fileId } });
    if (linkedVerification) {
      throw new ValidationError("File is already linked.");
    }
    const linkedReference = await prisma.inventoryItem.findFirst({ where: { referencePhotoId: fileId } });
    if (linkedReference) {
      throw new ValidationError("File is already linked.");
    }
  }
}

/** Inventory verification may use a dedicated verification photo or the cleaning completion photo on the same task. */
export async function assertVerificationPhotoFile(
  fileId: string,
  user: SessionUser,
  cleaningTaskId?: string,
): Promise<void> {
  const file = await prisma.storedFile.findUnique({ where: { id: fileId } });
  if (!file) throw new ValidationError("Invalid file reference.");
  if (file.uploadedById !== user.id) {
    throw new ForbiddenError();
  }

  if (cleaningTaskId && file.purpose === "CLEANING_PHOTO") {
    const onTask = await prisma.cleaningPhoto.findFirst({
      where: { fileId, cleaningTaskId },
    });
    if (onTask) return;
  }

  await assertFileOwnedForPurpose(fileId, user, "INVENTORY_VERIFICATION", {
    allowInventoryLink: true,
  });
}
