import { randomBytes, timingSafeEqual } from "crypto";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { csrfCookieOptions } from "@/server/http/cookie-options";
import { AppError, AuthError } from "@/server/lib/errors";
import { logger } from "@/server/lib/logger";
import type { SessionUser } from "@/server/modules/auth/session.service";
import { requireSessionUser } from "@/server/modules/auth/session.service";
import { assertPermission } from "@/server/rbac/authorize";
import type { PermissionCode } from "@/server/rbac/permissions";
import { getClientMeta } from "@/server/lib/client-meta";

export const CORRELATION_HEADER = "x-correlation-id";
export const CSRF_HEADER = "x-csrf-token";
export const CSRF_COOKIE = "ghms_csrf";

export function getCorrelationId(req: NextRequest): string {
  return req.headers.get(CORRELATION_HEADER) ?? randomBytes(16).toString("hex");
}

export { getClientMeta };

export function jsonError(err: unknown, correlationId: string): NextResponse {
  if (err instanceof AppError) {
    return NextResponse.json(
      {
        error: {
          code: err.code,
          message: err.exposeMessage ? err.message : "Unable to complete this request.",
          ...(err.details ? { details: err.details } : {}),
        },
        correlationId,
      },
      { status: err.statusCode },
    );
  }
  logger.error({ err, correlationId }, "Unhandled API error");
  return NextResponse.json(
    {
      error: { code: "INTERNAL_ERROR", message: "Unable to complete this request." },
      correlationId,
    },
    { status: 500 },
  );
}

export function jsonOk<T>(data: T, correlationId: string, init?: ResponseInit): NextResponse {
  return NextResponse.json({ data, correlationId }, init);
}

export async function assertCsrf(req: NextRequest): Promise<void> {
  const method = req.method.toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return;

  const cookieToken = req.cookies.get(CSRF_COOKIE)?.value;
  const headerToken = req.headers.get(CSRF_HEADER);
  if (!cookieToken || !headerToken) {
    throw new AuthError("Invalid CSRF token.");
  }
  const a = Buffer.from(cookieToken);
  const b = Buffer.from(headerToken);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new AuthError("Invalid CSRF token.");
  }
}

export type ApiContext = {
  req: NextRequest;
  user: SessionUser;
  correlationId: string;
  meta: ReturnType<typeof getClientMeta>;
};

export type ProtectedHandler = (ctx: ApiContext) => Promise<NextResponse>;

export function withAuth(
  permission: PermissionCode | PermissionCode[] | null,
  handler: ProtectedHandler,
  options?: { skipCsrf?: boolean; anyOf?: boolean },
) {
  return async (req: NextRequest): Promise<NextResponse> => {
    const correlationId = getCorrelationId(req);
    try {
      if (!options?.skipCsrf) {
        await assertCsrf(req);
      }
      const user = await requireSessionUser(req);
      if (permission) {
        const perms = Array.isArray(permission) ? permission : [permission];
        if (options?.anyOf) {
          const { assertAnyPermission } = await import("@/server/rbac/authorize");
          assertAnyPermission(user, perms);
        } else {
          for (const p of perms) {
            assertPermission(user, p);
          }
        }
      }
      return await handler({ req, user, correlationId, meta: getClientMeta(req) });
    } catch (err) {
      return jsonError(err, correlationId);
    }
  };
}

export function withPublicHandler(handler: (ctx: {
  req: NextRequest;
  correlationId: string;
  meta: ReturnType<typeof getClientMeta>;
}) => Promise<NextResponse>) {
  return async (req: NextRequest): Promise<NextResponse> => {
    const correlationId = getCorrelationId(req);
    try {
      return await handler({ req, correlationId, meta: getClientMeta(req) });
    } catch (err) {
      return jsonError(err, correlationId);
    }
  };
}

export function setCsrfCookie(response: NextResponse, req: NextRequest): NextResponse {
  const token = randomBytes(32).toString("base64url");
  response.cookies.set(CSRF_COOKIE, token, csrfCookieOptions(req));
  return response;
}
