import "dotenv/config";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { minimalJpegBuffer } from "../helpers/minimal-jpeg";

const { sdkMock, presignerMock, prismaMock, scanMock, auditMock } = vi.hoisted(() => {
  type CommandInput = Record<string, unknown>;
  type MockCommand = { operation: string; input: CommandInput };
  const commands: MockCommand[] = [];
  const send = vi.fn(async (_command: MockCommand) => ({
    Body: { transformToByteArray: async () => new Uint8Array([1, 2, 3]) },
  }));

  class MockS3Client {
    constructor(_config: Record<string, unknown>) {}
    send(command: MockCommand) {
      commands.push(command);
      return send(command);
    }
  }

  class MockPutObjectCommand {
    readonly operation = "PutObject";
    constructor(readonly input: CommandInput) {}
  }

  class MockGetObjectCommand {
    readonly operation = "GetObject";
    constructor(readonly input: CommandInput) {}
  }

  return {
    sdkMock: { commands, send, MockS3Client, MockPutObjectCommand, MockGetObjectCommand },
    presignerMock: {
      getSignedUrl: vi.fn(async (_client: unknown, _command: unknown, _options: { expiresIn: number }) =>
        "https://storage.example/private-object?signature=test",
      ),
    },
    prismaMock: {
      storedFile: { create: vi.fn(), findUnique: vi.fn() },
      inventoryItem: { update: vi.fn() },
      cleaningPhoto: { findFirst: vi.fn() },
      maintenancePhoto: { findFirst: vi.fn() },
      inventoryVerification: { findFirst: vi.fn() },
    },
    scanMock: { scanUploadBuffer: vi.fn(async () => undefined) },
    auditMock: { writeAuditLog: vi.fn(async () => undefined) },
  };
});

vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: sdkMock.MockS3Client,
  PutObjectCommand: sdkMock.MockPutObjectCommand,
  GetObjectCommand: sdkMock.MockGetObjectCommand,
}));
vi.mock("@aws-sdk/s3-request-presigner", () => ({ getSignedUrl: presignerMock.getSignedUrl }));
vi.mock("@/server/config/env", () => ({
  getEnv: () => ({
    STORAGE_DRIVER: "s3",
    STORAGE_S3_BUCKET: "private-test-bucket",
    STORAGE_S3_REGION: "us-east-1",
    STORAGE_S3_ENDPOINT: "https://storage.example/storage/v1/s3",
    STORAGE_S3_ACCESS_KEY_ID: "test-access-key",
    STORAGE_S3_SECRET_ACCESS_KEY: "test-secret-key",
    UPLOAD_MAX_BYTES: 5_242_880,
    UPLOAD_MAX_WIDTH: 4096,
    UPLOAD_MAX_HEIGHT: 4096,
  }),
}));
vi.mock("@/server/db/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/server/modules/files/malware-scan.service", () => scanMock);
vi.mock("@/server/modules/audit/audit.service", () => auditMock);

import { getSignedDownloadUrl, putPrivateObject } from "@/server/modules/files/storage.service";
import { processAndStoreImage, readStoredFile } from "@/server/modules/files/file.service";
import { attachInventoryReferencePhoto } from "@/server/modules/inventory/room-inventory.service";

const admin = {
  id: "admin-id",
  email: "admin@example.com",
  name: "Test Admin",
  role: "ADMIN" as const,
  status: "ACTIVE" as const,
  canViewFinancials: false,
  mfaEnabled: true,
};

describe("Supabase-compatible S3 storage", () => {
  let storedFileRecord: Record<string, unknown> | null;

  beforeEach(() => {
    vi.clearAllMocks();
    sdkMock.commands.length = 0;
    storedFileRecord = null;
    sdkMock.send.mockResolvedValue({
      Body: { transformToByteArray: async () => new Uint8Array([1, 2, 3]) },
    });
    presignerMock.getSignedUrl.mockResolvedValue(
      "https://storage.example/private-object?signature=test",
    );
    prismaMock.storedFile.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
      storedFileRecord = { ...data, id: "stored-file-id" };
      return { id: storedFileRecord.id };
    });
    prismaMock.storedFile.findUnique.mockImplementation(async () => storedFileRecord);
    prismaMock.inventoryItem.update.mockImplementation(async ({ where, data }: {
      where: { id: string };
      data: Record<string, unknown>;
    }) => ({ id: where.id, ...data }));
    prismaMock.cleaningPhoto.findFirst.mockResolvedValue(null);
    prismaMock.maintenancePhoto.findFirst.mockResolvedValue(null);
    prismaMock.inventoryVerification.findFirst.mockResolvedValue(null);
  });

  it("does not send ACL or ServerSideEncryption in PutObject", async () => {
    const body = Buffer.from("private photo bytes");

    await putPrivateObject("inventory_reference/photo.jpg", body, "image/jpeg");

    expect(sdkMock.commands).toHaveLength(1);
    expect(sdkMock.commands[0]?.input).toMatchObject({
      Bucket: "private-test-bucket",
      Key: "inventory_reference/photo.jpg",
      Body: body,
      ContentType: "image/jpeg",
    });
    expect(sdkMock.commands[0]?.input).not.toHaveProperty("ACL");
    expect(sdkMock.commands[0]?.input).not.toHaveProperty("ServerSideEncryption");
  });

  it("stores an inventory photo, attaches its record, and retains signed private downloads", async () => {
    const jpeg = await minimalJpegBuffer();
    const uploaded = await processAndStoreImage(jpeg, "INVENTORY_REFERENCE", admin);

    expect(uploaded.fileId).toBe("stored-file-id");
    expect(prismaMock.storedFile.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        purpose: "INVENTORY_REFERENCE",
        storageKey: expect.stringMatching(/^inventory_reference\//),
        mimeType: "image/jpeg",
        uploadedById: admin.id,
      }),
    });
    expect(sdkMock.commands[0]?.operation).toBe("PutObject");

    const attached = await attachInventoryReferencePhoto(admin, "inventory-item-id", uploaded.fileId);
    expect(attached).toMatchObject({ id: "inventory-item-id", referencePhotoId: uploaded.fileId });
    expect(prismaMock.inventoryItem.update).toHaveBeenCalledWith({
      where: { id: "inventory-item-id" },
      data: { referencePhotoId: uploaded.fileId },
    });
    expect(auditMock.writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      action: "inventory.photo.uploaded",
      resourceId: "inventory-item-id",
      result: "SUCCESS",
    }));

    const stored = await readStoredFile(uploaded.fileId, admin);
    expect(stored.signedUrl).toBe("https://storage.example/private-object?signature=test");
    expect(presignerMock.getSignedUrl).toHaveBeenCalledWith(
      expect.any(sdkMock.MockS3Client),
      expect.objectContaining({
        operation: "GetObject",
        input: { Bucket: "private-test-bucket", Key: storedFileRecord?.storageKey },
      }),
      { expiresIn: 300 },
    );
  });

  it("keeps the signed-download storage helper unchanged", async () => {
    const signedUrl = await getSignedDownloadUrl("inventory_reference/existing.jpg", 180);

    expect(signedUrl).toBe("https://storage.example/private-object?signature=test");
    expect(presignerMock.getSignedUrl).toHaveBeenCalledWith(
      expect.any(sdkMock.MockS3Client),
      expect.objectContaining({
        operation: "GetObject",
        input: { Bucket: "private-test-bucket", Key: "inventory_reference/existing.jpg" },
      }),
      { expiresIn: 180 },
    );
  });
});