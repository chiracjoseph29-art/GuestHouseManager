import { createHash } from "crypto";
import type { NextRequest } from "next/server";
import { isDevelopment } from "@/server/config/env";
import { CSRF_COOKIE } from "@/server/http/api-handler";
import { SESSION_COOKIE } from "@/server/modules/auth/session.service";
import { resolveCookieSecure } from "@/server/http/cookie-options";
import { logger } from "@/server/lib/logger";

function debugEnabled(): boolean {
  return isDevelopment() && process.env.AUTH_FLOW_DEBUG === "true";
}

/** Safe email fingerprint for logs — never the raw address. */
export function emailFingerprint(email: string): string {
  return createHash("sha256").update(email.trim().toLowerCase()).digest("hex").slice(0, 12);
}

export function databaseHostLabel(): string {
  const url = process.env.DATABASE_URL ?? "";
  try {
    return new URL(url.replace(/^postgresql:/i, "http:")).hostname || "unknown";
  } catch {
    return "unparseable";
  }
}

export function logAuthFlow(
  step: string,
  req: Pick<NextRequest, "headers" | "cookies" | "method">,
  extra?: Record<string, string | number | boolean | null | undefined>,
): void {
  if (!debugEnabled()) return;
  const host = req.headers.get("host") ?? "";
  logger.info(
    {
      authFlow: step,
      method: req.method,
      host,
      origin: req.headers.get("origin") ?? null,
      userAgentPresent: Boolean(req.headers.get("user-agent")),
      hasSessionCookie: Boolean(req.cookies.get(SESSION_COOKIE)?.value),
      hasCsrfCookie: Boolean(req.cookies.get(CSRF_COOKIE)?.value),
      cookieSecureFlag: resolveCookieSecure(req),
      dbHost: databaseHostLabel(),
      nodeEnv: process.env.NODE_ENV,
      ...extra,
    },
    "auth.flow",
  );
}
