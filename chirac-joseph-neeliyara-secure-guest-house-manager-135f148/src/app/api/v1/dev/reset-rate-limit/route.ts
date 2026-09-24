import { jsonOk, withPublicHandler } from "@/server/http/api-handler";
import { resetDevRateLimitCaches } from "@/server/lib/rate-limit";
import { AppError } from "@/server/lib/errors";

/** POST — development-only; clears in-memory login rate-limit state when explicitly enabled. */
export const POST = withPublicHandler(async ({ correlationId }) => {
  if (process.env.NODE_ENV !== "development" || process.env.ALLOW_DEV_RATE_LIMIT_RESET !== "true") {
    throw new AppError("Not found.", 404, "NOT_FOUND", false);
  }
  const result = resetDevRateLimitCaches();
  return jsonOk({ ok: true, ...result }, correlationId);
});
