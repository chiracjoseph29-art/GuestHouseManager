import { RateLimiterMemory, RateLimiterRedis } from "rate-limiter-flexible";

type Limiter = RateLimiterMemory | RateLimiterRedis;

const cache = new Map<string, Limiter>();

/**
 * Development-only: drop cached in-memory limiters so login attempt counters reset.
 * Requires ALLOW_DEV_RATE_LIMIT_RESET=true. Does not affect production or Redis-backed limits.
 */
export function resetDevRateLimitCaches(): { clearedLimiters: number } {
  if (process.env.NODE_ENV !== "development" || process.env.ALLOW_DEV_RATE_LIMIT_RESET !== "true") {
    return { clearedLimiters: 0 };
  }
  const clearedLimiters = cache.size;
  cache.clear();
  return { clearedLimiters };
}

export async function getRateLimiter(
  name: string,
  points: number,
  durationSeconds: number,
): Promise<Limiter> {
  const key = `${name}:${points}:${durationSeconds}`;
  const existing = cache.get(key);
  if (existing) return existing;

  const redisUrl = process.env.REDIS_URL;
  if (redisUrl) {
    const { default: Redis } = await import("ioredis");
    const client = new Redis(redisUrl, { maxRetriesPerRequest: 1, enableOfflineQueue: false });
    const limiter = new RateLimiterRedis({
      storeClient: client,
      keyPrefix: `ghms:rl:${name}`,
      points,
      duration: durationSeconds,
    });
    cache.set(key, limiter);
    return limiter;
  }

  const limiter = new RateLimiterMemory({ points, duration: durationSeconds });
  cache.set(key, limiter);
  return limiter;
}

export async function consumeRateLimit(key: string, limiter: Limiter): Promise<void> {
  try {
    await limiter.consume(key);
  } catch {
    const { AppError } = await import("@/server/lib/errors");
    throw new AppError("Too many attempts. Please try again later.", 429, "RATE_LIMITED", true);
  }
}
