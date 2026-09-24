import { NextResponse } from "next/server";
import { withPublicHandler } from "@/server/http/api-handler";
import { attachSessionCookie } from "@/server/modules/auth/session.service";
import { consumeSessionBootstrap } from "@/server/modules/auth/session-bootstrap";
import { logAuthFlow } from "@/server/lib/auth-flow-log";
import { describeSetCookieAttributes } from "@/server/http/cookie-attributes";
import { SESSION_COOKIE } from "@/server/modules/auth/session.service";

/**
 * Top-level navigation endpoint: establishes the session cookie when Safari ignored
 * Set-Cookie on the JSON login fetch (common on http://<LAN-IP> in iOS Safari).
 */
export const GET = withPublicHandler(async ({ req }) => {
  const token = req.nextUrl.searchParams.get("t") ?? "";
  const consumed = token ? consumeSessionBootstrap(token) : null;

  if (!consumed) {
    logAuthFlow("bootstrap.rejected", req, { reason: "invalid_or_expired" });
    return NextResponse.redirect(new URL("/login?error=session", req.url));
  }

  const response = NextResponse.redirect(new URL("/app", req.url));
  attachSessionCookie(response, req, {
    token: consumed.sessionToken,
    expiresAt: consumed.cookieExpiresAt,
  });

  const setCookieLines = response.headers.getSetCookie?.() ?? [];
  const sessionLine = setCookieLines.find((l) => l.startsWith(`${SESSION_COOKIE}=`)) ?? "";
  const attrs = describeSetCookieAttributes(sessionLine);
  logAuthFlow("bootstrap.ok", req, {
    cookieHasSecure: attrs?.hasSecure ?? null,
    cookieHasHttpOnly: attrs?.hasHttpOnly ?? null,
    cookieSameSite: attrs?.sameSite ?? null,
    cookieDomain: attrs?.domain ?? null,
    cookiePath: attrs?.path ?? null,
    cookieHasMaxAge: attrs?.hasMaxAge ?? null,
  });

  return response;
});
