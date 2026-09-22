import { logout } from "@/server/modules/auth/auth.service";
import { getRawSessionTokenFromCookies } from "@/server/modules/auth/session.service";
import { jsonOk, withAuth } from "@/server/http/api-handler";

export const POST = withAuth(null, async ({ meta, correlationId, user }) => {
  const token = await getRawSessionTokenFromCookies();
  await logout(token, { ...meta, correlationId, userId: user.id });
  return jsonOk({ ok: true }, correlationId);
});
