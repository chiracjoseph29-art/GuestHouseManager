import "dotenv/config";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { prismaMock, sessionMock } = vi.hoisted(() => ({
  prismaMock: {
    inventoryItem: { findMany: vi.fn() },
    inventoryCategory: { findMany: vi.fn() },
    roomInventory: { groupBy: vi.fn() },
  },
  sessionMock: {
    requireSessionUser: vi.fn(async () => ({
      id: "admin-id",
      email: "admin@example.com",
      name: "Test Admin",
      role: "ADMIN" as const,
      status: "ACTIVE" as const,
      canViewFinancials: false,
      mfaEnabled: true,
    })),
  },
}));

vi.mock("@/server/db/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/server/modules/auth/session.service", () => ({
  requireSessionUser: sessionMock.requireSessionUser,
  issueSessionCredentials: vi.fn(),
  revokeSessionByToken: vi.fn(),
  revokeAllUserSessions: vi.fn(),
}));

import { GET } from "@/app/api/v1/inventory/route";

describe("GET /api/v1/inventory with a reference photo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.inventoryItem.findMany.mockResolvedValue([
      {
        id: "item-id",
        name: "Bed linen",
        categoryId: "category-id",
        quantity: 4,
        minimumThreshold: 1,
        unit: "sets",
        location: null,
        allowNegative: false,
        referencePhotoId: "stored-file-id",
        createdAt: new Date("2026-09-20T12:00:00.000Z"),
        updatedAt: new Date("2026-09-21T12:00:00.000Z"),
        category: { id: "category-id", name: "Housekeeping" },
      },
    ]);
    prismaMock.inventoryCategory.findMany.mockResolvedValue([
      { id: "category-id", name: "Housekeeping" },
    ]);
    prismaMock.roomInventory.groupBy.mockResolvedValue([]);
  });

  it("returns the attached photo ID without fetching the StoredFile relation", async () => {
    const response = await GET(new NextRequest("http://localhost/api/v1/inventory"));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.items[0]).toMatchObject({
      id: "item-id",
      referencePhotoId: "stored-file-id",
      category: { id: "category-id", name: "Housekeeping" },
      assignedQuantity: 0,
    });
    expect(prismaMock.inventoryItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          referencePhotoId: true,
          category: { select: { id: true, name: true } },
        }),
      }),
    );
    expect(prismaMock.inventoryItem.findMany.mock.calls[0]?.[0]).not.toHaveProperty(
      "include.referencePhoto",
    );
  });
});