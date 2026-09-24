import { getSessionUser, SESSION_COOKIE } from "@/server/modules/auth/session.service";
import { jsonOk, withPublicHandler } from "@/server/http/api-handler";
import { logger } from "@/server/lib/logger";
import { resolveCookieSecure } from "@/server/http/cookie-options";
import { logAuthFlow } from "@/server/lib/auth-flow-log";

export const GET = withPublicHandler(async ({ req, correlationId }) => {
  logAuthFlow("me.request", req);
  const user = await getSessionUser(req);
    if (!user) {
    const hasSessionCookie = Boolean(req.cookies.get(SESSION_COOKIE)?.value);
    logAuthFlow("me.no_session", req, {
      sessionLookupSucceeded: false,
      hasSessionCookie,
    });
    if (hasSessionCookie) {
      logger.warn(
        {
          host: req.headers.get("host"),
          cookieSecureFlag: resolveCookieSecure(req),
          hasSessionCookie: true,
        },
        "auth.me: session cookie present but not valid",
      );
    }
    return jsonOk({ user: null }, correlationId);
  }
  logAuthFlow("me.ok", req, { sessionLookupSucceeded: true });
  return jsonOk({ user }, correlationId);
});
