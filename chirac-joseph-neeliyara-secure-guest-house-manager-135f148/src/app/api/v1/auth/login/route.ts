import { login } from "@/server/modules/auth/auth.service";
import { jsonOk, withPublicHandler, CSRF_COOKIE } from "@/server/http/api-handler";
import { loginSchema } from "@/server/http/schemas";
import { ValidationError } from "@/server/lib/errors";
import { attachSessionCookie, SESSION_COOKIE } from "@/server/modules/auth/session.service";
import { emailFingerprint, logAuthFlow } from "@/server/lib/auth-flow-log";
import { describeSetCookieAttributes } from "@/server/http/cookie-attributes";
import { needsSessionCookieBootstrap } from "@/server/http/cookie-options";
import { issueSessionBootstrap } from "@/server/modules/auth/session-bootstrap";
import { logger } from "@/server/lib/logger";

export const POST = withPublicHandler(async ({ req, correlationId, meta }) => {
  logAuthFlow("login.request", req, {
    origin: req.headers.get("origin"),
    uaIsIphone: (req.headers.get("user-agent") ?? "").includes("iPhone"),
  });
  const body = await req.json().catch(() => null);
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    logAuthFlow("login.validation_failed", req, {
      bodyIsObject: Boolean(body && typeof body === "object"),
      emailPresent: Boolean(body && typeof body === "object" && "email" in body),
      passwordPresent: Boolean(body && typeof body === "object" && "password" in body),
    });
    throw new ValidationError();
  }

  const email = parsed.data.email;
  const password = parsed.data.password;
  logAuthFlow("login.parsed", req, {
    emailFp: emailFingerprint(email),
    emailLength: email.length,
    emailHadWhitespace: email !== email.trim(),
    passwordLength: password.length,
    passwordHadWhitespace: password !== password.trim(),
    emailStateMatchesDom: parsed.data.clientDiag?.emailStateMatchesDom,
    passwordStateMatchesDom: parsed.data.clientDiag?.passwordStateMatchesDom,
  });

  let result;
  try {
    result = await login(email, password, { ...meta, correlationId }, parsed.data.clientDiag);
  } catch (err) {
    const code =
      err && typeof err === "object" && "code" in err ? String((err as { code: string }).code) : "error";
    logAuthFlow("login.rejected", req, { outcome: code });
    throw err;
  }
  if (result.status === "session") {
    const bootstrapNeeded = needsSessionCookieBootstrap(req);
    const bootstrapToken = bootstrapNeeded
      ? issueSessionBootstrap(result.sessionAttach.token, result.sessionAttach.expiresAt)
      : undefined;

    const response = jsonOk(
      {
        status: result.status,
        userId: result.userId,
        ...(bootstrapToken ? { bootstrapToken } : {}),
      },
      correlationId,
    );
    attachSessionCookie(response, req, result.sessionAttach);

    const setCookieLines = response.headers.getSetCookie?.() ?? [];
    const sessionLine =
      setCookieLines.find((l) => l.startsWith(`${SESSION_COOKIE}=`)) ??
      response.headers.get("set-cookie") ??
      "";
    const attrs = describeSetCookieAttributes(sessionLine);
    const attrLog = {
      setSessionCookie: Boolean(attrs),
      hasCsrfCookie: Boolean(req.cookies.get(CSRF_COOKIE)?.value),
      bootstrapIssued: Boolean(bootstrapToken),
      cookieHasSecure: attrs?.hasSecure ?? null,
      cookieHasHttpOnly: attrs?.hasHttpOnly ?? null,
      cookieSameSite: attrs?.sameSite ?? null,
      cookieDomain: attrs?.domain ?? null,
      cookiePath: attrs?.path ?? null,
      cookieHasMaxAge: attrs?.hasMaxAge ?? null,
      cookieHasExpires: attrs?.hasExpires ?? null,
      cookieMaxAge: attrs?.maxAge ?? null,
    };
    logAuthFlow("login.session_issued", req, attrLog);
    if (process.env.NODE_ENV === "development") {
      logger.info(
        {
          authFlow: "login.cookie_attrs",
          host: req.headers.get("host"),
          origin: req.headers.get("origin"),
          ...attrLog,
        },
        "auth.flow",
      );
    }
    return response;
  }
  logAuthFlow("login.mfa_required", req);
  return jsonOk(result, correlationId);
});
