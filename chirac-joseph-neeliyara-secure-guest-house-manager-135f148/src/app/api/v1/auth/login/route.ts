import { login } from "@/server/modules/auth/auth.service";
import { jsonOk, withPublicHandler } from "@/server/http/api-handler";
import { loginSchema } from "@/server/http/schemas";
import { ValidationError } from "@/server/lib/errors";

export const POST = withPublicHandler(async ({ req, correlationId, meta }) => {
  const body = await req.json().catch(() => null);
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) throw new ValidationError();
  const result = await login(parsed.data.email, parsed.data.password, {
    ...meta,
    correlationId,
  });
  return jsonOk(result, correlationId);
});
