import "dotenv/config";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { verifyPassword } from "@/server/lib/crypto";

const { prismaMock, sessionMock, storedUsers, auditEvents } = vi.hoisted(() => ({
  storedUsers: [] as Array<Record<string, unknown>>,
  auditEvents: [] as Array<Record<string, unknown>>,
  sessionMock: {
    role: "ADMIN" as "ADMIN" | "MANAGER" | "CLEANER",
    requireSessionUser: vi.fn(async () => ({
      id: "actor-id",
      email: "actor@example.com",
      name: "Test Actor",
      role: "ADMIN" as "ADMIN" | "MANAGER" | "CLEANER",
      status: "ACTIVE" as const,
      canViewFinancials: false,
      mfaEnabled: true,
    })),
  },
  prismaMock: {
    user: {
      create: vi.fn(),
      findMany: vi.fn(),
    },
    auditLog: { create: vi.fn() },
  },
}));

vi.mock("@/server/db/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/server/modules/auth/session.service", () => ({
  requireSessionUser: sessionMock.requireSessionUser,
  issueSessionCredentials: vi.fn(),
  revokeSessionByToken: vi.fn(),
  revokeAllUserSessions: vi.fn(),
}));

import { POST } from "@/app/api/v1/users/route";

function request(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/v1/users", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: "ghms_csrf=test-csrf",
      "x-csrf-token": "test-csrf",
    },
    body: JSON.stringify(body),
  });
}

const staffInput = {
  name: "Test Staff",
  email: "staff@example.com",
  password: "Temporary passphrase 123!",
};

describe("POST /api/v1/users", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storedUsers.length = 0;
    auditEvents.length = 0;
    sessionMock.role = "ADMIN";
    sessionMock.requireSessionUser.mockImplementation(async () => ({
      id: "actor-id",
      email: "actor@example.com",
      name: "Test Actor",
      role: sessionMock.role,
      status: "ACTIVE",
      canViewFinancials: false,
      mfaEnabled: true,
    }));
    prismaMock.user.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
      if (storedUsers.some((user) => user.email === data.email)) {
        throw { code: "P2002" };
      }
      const user = { ...data, id: `staff-${storedUsers.length + 1}` };
      storedUsers.push(user);
      return { id: user.id };
    });
    prismaMock.auditLog.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
      auditEvents.push(data);
      return data;
    });
  });

  it.each(["MANAGER", "CLEANER"] as const)("allows ADMIN to create a %s account", async (role) => {
    const response = await POST(request({ ...staffInput, role }));

    expect(response.status).toBe(200);
    expect(storedUsers).toHaveLength(1);
    expect(storedUsers[0]).toMatchObject({ role, status: "ACTIVE", createdById: "actor-id" });
    expect(auditEvents).toContainEqual(expect.objectContaining({
      userId: "actor-id",
      action: "user.created",
      resourceType: "user",
      resourceId: "staff-1",
      result: "SUCCESS",
    }));
  });

  it("denies a non-admin from creating users", async () => {
    sessionMock.role = "MANAGER";

    const response = await POST(request({ ...staffInput, role: "CLEANER" }));

    expect(response.status).toBe(403);
    expect(prismaMock.user.create).not.toHaveBeenCalled();
    expect(auditEvents).toHaveLength(0);
  });

  it("rejects ADMIN role through the endpoint schema", async () => {
    const response = await POST(request({ ...staffInput, role: "ADMIN" }));

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: { message: "Only MANAGER and CLEANER accounts can be created." },
    });
    expect(prismaMock.user.create).not.toHaveBeenCalled();
  });

  it("stores an Argon2id hash rather than the submitted password", async () => {
    await POST(request({ ...staffInput, role: "MANAGER" }));
    const storedHash = String(storedUsers[0].passwordHash);

    expect(storedHash).not.toBe(staffInput.password);
    expect(storedHash).toMatch(/^\$argon2id\$/);
    expect(await verifyPassword(storedHash, staffInput.password)).toBe(true);
  });

  it("rejects duplicate email with a conflict and does not audit a second creation", async () => {
    const payload = { ...staffInput, role: "CLEANER" };
    const firstResponse = await POST(request(payload));
    const duplicateResponse = await POST(request(payload));

    expect(firstResponse.status).toBe(200);
    expect(duplicateResponse.status).toBe(409);
    expect(await duplicateResponse.json()).toMatchObject({
      error: { message: "An account with this email already exists." },
    });
    expect(storedUsers).toHaveLength(1);
    expect(auditEvents).toHaveLength(1);
  });
});