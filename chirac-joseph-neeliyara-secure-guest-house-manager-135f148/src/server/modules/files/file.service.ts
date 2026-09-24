import { mkdir, writeFile, readFile, unlink } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import sharp from "sharp";
import { getEnv } from "@/server/config/env";
import { ValidationError, ForbiddenError, NotFoundError } from "@/server/lib/errors";
import { prisma } from "@/server/db/prisma";
import type { FilePurpose } from "@/generated/prisma/client";
import type { SessionUser } from "@/server/modules/auth/session.service";
import { scanUploadBuffer } from "@/server/modules/files/malware-scan.service";
import { getObjectBuffer, putPrivateObject, getSignedDownloadUrl } from "@/server/modules/files/storage.service";

const ALLOWED_MIMES = new Set(["image/jpeg", "image/png", "image/webp"]);

function detectMime(buffer: Buffer): string | null {
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xd8) return "image/jpeg";
  if (buffer.length >= 2 && buffer[0] === 0x89 && buffer[1] === 0x50) return "image/png";
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}

async function ensureStorageDir(): Promise<string> {
  const env = getEnv();
  const dir = path.resolve(env.STORAGE_LOCAL_PATH);
  await mkdir(dir, { recursive: true });
  return dir;
}

async function processImageBuffer(buffer: Buffer): Promise<{ data: Buffer; mimeType: string; ext: string }> {
  const env = getEnv();
  const detected = detectMime(buffer);
  if (!detected || !ALLOWED_MIMES.has(detected)) {
    throw new ValidationError("Unsupported file type.");
  }

  const processed = await sharp(buffer, { failOn: "error" })
    .rotate()
    .resize({
      width: env.UPLOAD_MAX_WIDTH,
      height: env.UPLOAD_MAX_HEIGHT,
      fit: "inside",
      withoutEnlargement: true,
    })
    .toFormat(detected === "image/png" ? "png" : detected === "image/webp" ? "webp" : "jpeg", {
      mozjpeg: true,
    })
    .toBuffer({ resolveWithObject: true });

  const ext = processed.info.format === "png" ? "png" : processed.info.format === "webp" ? "webp" : "jpg";
  return { data: processed.data, mimeType: detected, ext };
}

export async function processAndStoreImage(
  buffer: Buffer,
  purpose: FilePurpose,
  user: SessionUser,
): Promise<{ fileId: string }> {
  const env = getEnv();
  if (buffer.length > env.UPLOAD_MAX_BYTES) {
    throw new ValidationError("File exceeds maximum allowed size.");
  }

  await scanUploadBuffer(buffer);

  const { data, mimeType, ext } = await processImageBuffer(buffer);
  const storageKey = `${purpose.toLowerCase()}/${randomUUID()}.${ext}`;

  if (env.STORAGE_DRIVER === "local") {
    const dir = await ensureStorageDir();
    const fullPath = path.join(dir, storageKey);
    await mkdir(path.dirname(fullPath), { recursive: true });
    const resolved = path.resolve(fullPath);
    const base = path.resolve(dir);
    if (!resolved.startsWith(base + path.sep) && resolved !== base) {
      throw new ForbiddenError();
    }
    await writeFile(resolved, data);
  } else {
    await putPrivateObject(storageKey, data, mimeType);
  }

  const file = await prisma.storedFile.create({
    data: {
      purpose,
      storageKey,
      mimeType,
      sizeBytes: data.length,
      uploadedById: user.id,
    },
  });

  return { fileId: file.id };
}

export async function readStoredFile(
  fileId: string,
  user: SessionUser,
): Promise<{ buffer: Buffer; mimeType: string; signedUrl?: string }> {
  const file = await prisma.storedFile.findUnique({ where: { id: fileId } });
  if (!file) throw new NotFoundError();

  const allowed = await userCanAccessFile(fileId, user);
  if (!allowed) throw new ForbiddenError();

  const env = getEnv();
  if (env.STORAGE_DRIVER === "s3") {
    const signedUrl = await getSignedDownloadUrl(file.storageKey, 300);
    return { buffer: Buffer.alloc(0), mimeType: file.mimeType, signedUrl };
  }

  const fullPath = path.resolve(env.STORAGE_LOCAL_PATH, file.storageKey);
  const resolved = path.resolve(fullPath);
  const base = path.resolve(env.STORAGE_LOCAL_PATH);
  if (!resolved.startsWith(base + path.sep)) {
    throw new ForbiddenError();
  }

  const buffer = await readFile(resolved);
  return { buffer, mimeType: file.mimeType };
}

async function userCanAccessFile(fileId: string, user: SessionUser): Promise<boolean> {
  if (user.role === "ADMIN") return true;
  if (user.role === "MANAGER") {
    const file = await prisma.storedFile.findUnique({ where: { id: fileId }, select: { purpose: true } });
    return file?.purpose === "CLEANING_PHOTO" || file?.purpose === "MAINTENANCE_PHOTO";
  }

  const cleaningPhoto = await prisma.cleaningPhoto.findFirst({
    where: { fileId },
    include: { cleaningTask: true },
  });
  if (cleaningPhoto?.cleaningTask.assignedToId === user.id) return true;

  const maintenance = await prisma.maintenancePhoto.findFirst({
    where: { fileId },
    include: { issue: true },
  });
  if (maintenance?.issue.reportedById === user.id) return true;

  const owned = await prisma.storedFile.findFirst({ where: { id: fileId, uploadedById: user.id } });
  return !!owned;
}

export async function deleteQuarantineFile(quarantinePath: string): Promise<void> {
  try {
    await unlink(quarantinePath);
  } catch {
    /* ignore */
  }
}

/** Best-effort removal of blob after DB row is gone; does not throw. */
export async function deleteStoredFileBlob(storageKey: string): Promise<void> {
  const env = getEnv();
  try {
    if (env.STORAGE_DRIVER === "local") {
      const fullPath = path.resolve(env.STORAGE_LOCAL_PATH, storageKey);
      const base = path.resolve(env.STORAGE_LOCAL_PATH);
      if (!fullPath.startsWith(base + path.sep) && fullPath !== base) return;
      await unlink(fullPath);
      return;
    }
    /* S3 lifecycle / manual cleanup — DB record already removed */
  } catch {
    /* verification DB state remains authoritative */
  }
}
