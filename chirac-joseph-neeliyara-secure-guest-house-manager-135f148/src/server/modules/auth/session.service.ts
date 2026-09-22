import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import type { User } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";
import { getEnv } from "@/server/config/env";
import { generateSecureToken, hashToken } from "@/server/lib/crypto";
import { AuthError } from "@/server/lib/errors";

export const SESSION_COOKIE = "ghms_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 8; // 8 hours
const ADMIN_SESSION_TTL_MS = 1000 * 60 * 60 * 4;

export type SessionUser = Pick<
  User,
  "id" | "email" | "name" | "role" | "status" | "canViewFinancials" | "mfaEnabled"
>;

export async function createSession(
  userId: string,
  meta: { ipAddress?: string; userAgent?: string; isAdmin?: boolean },
): Promise<string> {
  const token = generateSecureToken(32);
  const tokenHash = hashToken(token);
  const ttl = meta.isAdmin ? ADMIN_SESSION_TTL_MS : SESSION_TTL_MS;
  const expiresAt = new Date(Date.now() + ttl);

  await prisma.session.create({
    data: {
      userId,
      tokenHash,
      expiresAt,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    },
  });

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: getEnv().COOKIE_SECURE,
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
    ...(getEnv().COOKIE_DOMAIN ? { domain: getEnv().COOKIE_DOMAIN } : {}),
  });

  return token;
}

export async function revokeSessionByToken(rawToken: string): Promise<void> {
  const tokenHash = hashToken(rawToken);
  await prisma.session.updateMany({
    where: { tokenHash, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, "", {
    httpOnly: true,
    secure: getEnv().COOKIE_SECURE,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

export async function revokeAllUserSessions(userId: string): Promise<number> {
  const result = await prisma.session.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  return result.count;
}

function getRawSessionToken(req?: NextRequest): string | null {
  if (req) {
    return req.cookies.get(SESSION_COOKIE)?.value ?? null;
  }
  return null;
}

export async function getSessionUser(req?: NextRequest): Promise<SessionUser | null> {
  let raw: string | null = getRawSessionToken(req);
  if (!raw) {
    const cookieStore = await cookies();
    raw = cookieStore.get(SESSION_COOKIE)?.value ?? null;
  }
  if (!raw) return null;

  const tokenHash = hashToken(raw);
  const session = await prisma.session.findFirst({
    where: {
      tokenHash,
      revokedAt: null,
      expiresAt: { gt: new Date() },
    },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          status: true,
          canViewFinancials: true,
          mfaEnabled: true,
        },
      },
    },
  });

  if (!session || session.user.status !== "ACTIVE") {
    return null;
  }

  await prisma.session.update({
    where: { id: session.id },
    data: { lastActivityAt: new Date() },
  });

  return session.user;
}

export async function requireSessionUser(req?: NextRequest): Promise<SessionUser> {
  const user = await getSessionUser(req);
  if (!user) throw new AuthError("Your session has expired. Please sign in again.");
  return user;
}

export async function getRawSessionTokenFromCookies(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get(SESSION_COOKIE)?.value ?? null;
}
