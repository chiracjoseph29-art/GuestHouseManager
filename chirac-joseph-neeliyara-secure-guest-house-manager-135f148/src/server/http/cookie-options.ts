import type { NextRequest } from "next/server";
import { getEnv, isProduction } from "@/server/config/env";
import { isIpLiteralHost } from "@/server/http/cookie-attributes";

/**
 * Whether Set-Cookie should include the Secure attribute.
 *
 * Browsers treat http://localhost as a secure context, so Secure cookies still work there.
 * Plain http://<LAN-IP> is not secure — Secure cookies are dropped, which breaks sessions on mobile LAN testing.
 */
export function resolveCookieSecure(req?: Pick<NextRequest, "headers"> | { headers: Headers }): boolean {
  const env = getEnv();
  if (!env.COOKIE_SECURE) return false;

  if (isProduction()) {
    return true;
  }

  const headers = req?.headers;
  if (!headers) {
    return false;
  }

  const forwarded = headers.get("x-forwarded-proto");
  if (forwarded === "https") return true;

  const host = (headers.get("host") ?? "").split(",")[0]?.trim() ?? "";
  if (/^localhost(?::\d+)?$/i.test(host) || /^127\.0\.0\.1(?::\d+)?$/.test(host)) {
    return true;
  }

  return false;
}

/** Host-only cookies for IP literals — Domain must not be set for LAN/mobile HTTP access. */
export function resolveCookieDomain(req?: Pick<NextRequest, "headers"> | { headers: Headers }): string | undefined {
  const configured = getEnv().COOKIE_DOMAIN?.trim();
  if (!configured) return undefined;
  const hostHeader = req?.headers.get("host") ?? "";
  const host = hostHeader.split(",")[0]?.trim().split(":")[0] ?? "";
  if (isIpLiteralHost(hostHeader) || /^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return undefined;
  return configured;
}

export type SessionCookieOptionInput = {
  expires?: Date;
  maxAge?: number;
};

/**
 * Cookie options for ghms_session.
 * Prefer maxAge (seconds) — more reliable than Expires alone on some mobile browsers.
 */
export function sessionCookieOptions(
  req: Pick<NextRequest, "headers"> | { headers: Headers },
  extra: SessionCookieOptionInput,
) {
  const domain = resolveCookieDomain(req);
  const maxAge =
    extra.maxAge ??
    (extra.expires ? Math.max(0, Math.floor((extra.expires.getTime() - Date.now()) / 1000)) : undefined);

  return {
    httpOnly: true,
    secure: resolveCookieSecure(req),
    sameSite: "lax" as const,
    path: "/",
    ...(maxAge !== undefined ? { maxAge } : {}),
    ...(extra.expires && maxAge === undefined ? { expires: extra.expires } : {}),
    ...(domain ? { domain } : {}),
  };
}

export function csrfCookieOptions(req: Pick<NextRequest, "headers"> | { headers: Headers }) {
  const domain = resolveCookieDomain(req);
  return {
    httpOnly: false,
    secure: resolveCookieSecure(req),
    sameSite: "lax" as const,
    path: "/",
    ...(domain ? { domain } : {}),
  };
}

/** True when a short-lived navigation bootstrap may be required (LAN HTTP IP / non-Secure cookie). */
export function needsSessionCookieBootstrap(
  req: Pick<NextRequest, "headers"> | { headers: Headers },
): boolean {
  if (isProduction()) return false;
  if (resolveCookieSecure(req)) return false;
  const host = req.headers.get("host") ?? "";
  return isIpLiteralHost(host);
}
