import { beforeEach, describe, expect, it, vi } from "vitest";
import { ForbiddenError } from "@/server/lib/errors";

const { prismaMock, storageMock } = vi.hoisted(() => ({
  prismaMock: {
    storedFile: { findUnique: vi.fn(), findFirst: vi.fn() },
    cleaningPhoto: { findFirst: vi.fn() },
    maintenancePhoto: { findFirst: vi.fn() },
  },
  storageMock: {
    getObjectBuffer: vi.fn(),
    putPrivateObject: vi.fn(),
    getSignedDownloadUrl: vi.fn(async () => "https://storage.example/signed-private-photo"),
  },
}));

vi.mock("@/server/config/env", () => ({
  getEnv: () => ({ STORAGE_DRIVER: "s3", STORAGE_LOCAL_PATH: "./storage/uploads" }),
}));
vi.mock("@/server/db/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/server/modules/files/storage.service", () => storageMock);
vi.mock("@/server/modules/files/malware-scan.service", () => ({ scanUploadBuffer: vi.fn() }));

import { readStoredFile } from "@/server/modules/files/file.service";

const fileRecord = {
  id: "stored-file-id",
  purpose: "INVENTORY_REFERENCE",
  storageKey: "inventory_reference/photo.jpg",
  mimeType: "image/jpeg",
  uploadedById: "admin-id",
};

const admin = {
  id: "admin-id",
  email: "admin@example.com",
  name: "Test Admin",
  role: "ADMIN" as const,
  status: "ACTIVE" as const,
  canViewFinancials: false,
  mfaEnabled: true,
};

const manager = {
  ...admin,
  id: "manager-id",
  email: "manager@example.com",
  role: "MANAGER" as const,
};

const cleaner = {
  ...admin,
  id: "cleaner-id",
  email: "cleaner@example.com",
  role: "CLEANER" as const,
};

describe("inventory reference-photo read authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.storedFile.findUnique.mockResolvedValue(fileRecord);
    prismaMock.storedFile.findFirst.mockResolvedValue(null);
    prismaMock.cleaningPhoto.findFirst.mockResolvedValue(null);
    prismaMock.maintenancePhoto.findFirst.mockResolvedValue(null);
    storageMock.getSignedDownloadUrl.mockResolvedValue("https://storage.example/signed-private-photo");
  });

  it.each([admin, manager])("returns a private signed URL for authorized $role access", async (user) => {
    const result = await readStoredFile(fileRecord.id, user);

    expect(result.signedUrl).toBe("https://storage.example/signed-private-photo");
    expect(result.mimeType).toBe("image/jpeg");
    expect(storageMock.getSignedDownloadUrl).toHaveBeenCalledWith(fileRecord.storageKey, 300);
  });

  it("continues to deny a Cleaner who does not own or have a linked photo", async () => {
    await expect(readStoredFile(fileRecord.id, cleaner)).rejects.toBeInstanceOf(ForbiddenError);
    expect(storageMock.getSignedDownloadUrl).not.toHaveBeenCalled();
  });
});