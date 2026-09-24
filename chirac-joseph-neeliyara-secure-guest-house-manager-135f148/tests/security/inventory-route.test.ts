import "dotenv/config";
import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "@/app/api/v1/inventory/route";
import { prisma } from "@/server/db/prisma";
import { SESSION_COOKIE } from "@/server/modules/auth/session.service";
import { generateSecureToken, hashToken } from "@/server/lib/crypto";

describe("GET /api/v1/inventory route", () => {
  it("returns 200 with items and categories for admin session", async () => {
    const admin = await prisma.user.findFirst({ where: { role: "ADMIN", status: "ACTIVE" } });
    expect(admin).toBeTruthy();

    const token = generateSecureToken(32);
    await prisma.session.create({
      data: {
        userId: admin!.id,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });
    const req = new NextRequest("http://localhost/api/v1/inventory", {
      headers: { cookie: `${SESSION_COOKIE}=${token}` },
    });

    const res = await GET(req);
    if (res.status !== 200) {
      const errBody = await res.json();
      throw new Error(`inventory GET failed: ${res.status} ${JSON.stringify(errBody)}`);
    }
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toBeDefined();
    expect(Array.isArray(body.data.items)).toBe(true);
    expect(Array.isArray(body.data.categories)).toBe(true);
  });
});
