import { requireSessionUser } from "@/server/modules/auth/session.service";
import { jsonOk, withPublicHandler } from "@/server/http/api-handler";

export const GET = withPublicHandler(async ({ req, correlationId }) => {
  const user = await requireSessionUser(req).catch(() => null);
  if (!user) {
    return jsonOk({ user: null }, correlationId);
  }
  return jsonOk({ user }, correlationId);
});
