import { prisma } from "@/server/db/prisma";
import { ForbiddenError, ValidationError } from "@/server/lib/errors";
import type { FilePurpose } from "@/generated/prisma/client";
import type { SessionUser } from "@/server/modules/auth/session.service";

export async function assertFileOwnedForPurpose(
  fileId: string,
  user: SessionUser,
  purpose: FilePurpose,
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
}
