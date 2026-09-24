import type { NextRequest } from "next/server";

/** Best-effort client IP for rate limiting and audit (never log raw tokens). */
export function resolveClientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  const realIp = req.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;

  // Next.js may expose the socket peer on the request in Node dev/proxy setups.
  const peer = (req as NextRequest & { ip?: string }).ip;
  if (peer) return peer;

  return "unknown";
}

export function getClientMeta(req: NextRequest) {
  return {
    ipAddress: resolveClientIp(req),
    userAgent: req.headers.get("user-agent") ?? undefined,
  };
}
