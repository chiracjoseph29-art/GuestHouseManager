import { completePasswordReset, requestPasswordReset } from "@/server/modules/auth/auth.service";
import { jsonOk, withPublicHandler } from "@/server/http/api-handler";
import { passwordResetConfirmSchema, passwordResetRequestSchema } from "@/server/http/schemas";
import { ValidationError } from "@/server/lib/errors";

export const POST = withPublicHandler(async ({ req, correlationId, meta }) => {
  const body = await req.json().catch(() => null);
  const parsed = passwordResetRequestSchema.safeParse(body);
  if (!parsed.success) throw new ValidationError();
  await requestPasswordReset(parsed.data.email, { ...meta, correlationId });
  return jsonOk({ ok: true, message: "If an account exists, instructions will be sent." }, correlationId);
});

export const PATCH = withPublicHandler(async ({ req, correlationId, meta }) => {
  const body = await req.json().catch(() => null);
  const parsed = passwordResetConfirmSchema.safeParse(body);
  if (!parsed.success) throw new ValidationError();
  await completePasswordReset(parsed.data.token, parsed.data.newPassword, { ...meta, correlationId });
  return jsonOk({ ok: true }, correlationId);
});
