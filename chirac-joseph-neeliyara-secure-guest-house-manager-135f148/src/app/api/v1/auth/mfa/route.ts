import { z } from "zod";
import { jsonOk, withAuth, withPublicHandler } from "@/server/http/api-handler";
import { ValidationError } from "@/server/lib/errors";
import {
  beginMfaEnrollment,
  confirmMfaEnrollment,
  disableMfa,
  verifyMfaLogin,
} from "@/server/modules/auth/mfa.service";
import { attachSessionCookie } from "@/server/modules/auth/session.service";
import { needsSessionCookieBootstrap } from "@/server/http/cookie-options";
import { issueSessionBootstrap } from "@/server/modules/auth/session-bootstrap";

const verifySchema = z.object({
  challengeToken: z.string().min(20),
  code: z.string().min(6).max(20),
});

export const POST = withPublicHandler(async ({ req, correlationId, meta }) => {
  const body = await req.json().catch(() => null);
  const parsed = verifySchema.safeParse(body);
  if (!parsed.success) throw new ValidationError();
  const result = await verifyMfaLogin(parsed.data.challengeToken, parsed.data.code, {
    ...meta,
    correlationId,
  });
  const bootstrapNeeded = needsSessionCookieBootstrap(req);
  const bootstrapToken = bootstrapNeeded
    ? issueSessionBootstrap(result.sessionAttach.token, result.sessionAttach.expiresAt)
    : undefined;
  const response = jsonOk(
    { userId: result.userId, ...(bootstrapToken ? { bootstrapToken } : {}) },
    correlationId,
  );
  attachSessionCookie(response, req, result.sessionAttach);
  return response;
});

export const PUT = withAuth(null, async ({ req, user, correlationId }) => {
  const body = await req.json().catch(() => null);
  const action = body?.action as string;
  if (action === "enroll") {
    const data = await beginMfaEnrollment(user);
    return jsonOk({ otpauthUrl: data.otpauthUrl, secret: data.secret }, correlationId);
  }
  if (action === "confirm") {
    const code = body?.code as string;
    if (!code) throw new ValidationError();
    const data = await confirmMfaEnrollment(user, code);
    return jsonOk(data, correlationId);
  }
  if (action === "disable") {
    const password = body?.password as string;
    const code = body?.code as string;
    if (!password || !code) throw new ValidationError();
    await disableMfa(user, { password, code });
    return jsonOk({ ok: true }, correlationId);
  }
  throw new ValidationError("Unknown action.");
});
