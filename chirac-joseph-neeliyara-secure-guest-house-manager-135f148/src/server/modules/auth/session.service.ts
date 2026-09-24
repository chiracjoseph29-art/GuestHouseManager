import { cookies, headers } from "next/headers";
import type { NextRequest } from "next/server";
import type { NextResponse } from "next/server";
import type { User } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";
import { sessionCookieOptions } from "@/server/http/cookie-options";
import { generateSecureToken, hashToken } from "@/server/lib/crypto";
import { AuthError } from "@/server/lib/errors";

export const SESSION_COOKIE = "ghms_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 8; // 8 hours
const ADMIN_SESSION_TTL_MS = 1000 * 60 * 60 * 4;
/** Avoid a session write on every API call (expensive on remote DB). */
const SESSION_ACTIVITY_TOUCH_INTERVAL_MS = 5 * 60 * 1000;

export type SessionUser = Pick<
  User,
  "id" | "email" | "name" | "role" | "status" | "canViewFinancials" | "mfaEnabled"
>;

export type SessionCookieAttach = { token: string; expiresAt: Date };

/** Creates the DB session and returns cookie material (does not set cookies). */
export async function issueSessionCredentials(
  userId: string,
  meta: { ipAddress?: string; userAgent?: string; isAdmin?: boolean },
): Promise<SessionCookieAttach> {
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

  return { token, expiresAt };
}

/** Attach session cookie to an API Route Handler response (reliable Set-Cookie on LAN/mobile). */
export function attachSessionCookie(
  response: NextResponse,
  req: Pick<NextRequest, "headers">,
  attach: SessionCookieAttach,
): void {
  const maxAge = Math.max(0, Math.floor((attach.expiresAt.getTime() - Date.now()) / 1000));
  response.cookies.set(
    SESSION_COOKIE,
    attach.token,
    sessionCookieOptions(req, { maxAge, expires: attach.expiresAt }),
  );
}

export async function createSession(
  userId: string,
  meta: { ipAddress?: string; userAgent?: string; isAdmin?: boolean },
): Promise<string> {
  const attach = await issueSessionCredentials(userId, meta);
  const cookieStore = await cookies();
  const headerStore = await headers();
  cookieStore.set(
    SESSION_COOKIE,
    attach.token,
    sessionCookieOptions({ headers: headerStore }, { expires: attach.expiresAt }),
  );
  return attach.token;
}

export async function revokeSessionByToken(rawToken: string): Promise<void> {
  const tokenHash = hashToken(rawToken);
  await prisma.session.updateMany({
    where: { tokenHash, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  const cookieStore = await cookies();
  const headerStore = await headers();
  cookieStore.set(SESSION_COOKIE, "", sessionCookieOptions({ headers: headerStore }, { maxAge: 0 }));
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

  const now = new Date();
  if (now.getTime() - session.lastActivityAt.getTime() >= SESSION_ACTIVITY_TOUCH_INTERVAL_MS) {
    await prisma.session.update({
      where: { id: session.id },
      data: { lastActivityAt: now },
    });
  }

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
