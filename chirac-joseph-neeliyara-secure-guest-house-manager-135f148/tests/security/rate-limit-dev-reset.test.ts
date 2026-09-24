import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { getRateLimiter, consumeRateLimit, resetDevRateLimitCaches } from "@/server/lib/rate-limit";

describe("resetDevRateLimitCaches", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("ALLOW_DEV_RATE_LIMIT_RESET", "true");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    resetDevRateLimitCaches();
  });

  it("clears in-memory login limiter after too many attempts", async () => {
    const limiter = await getRateLimiter("login", 2, 60);
    await consumeRateLimit("test-ip:admin@test.local", limiter);
    await consumeRateLimit("test-ip:admin@test.local", limiter);
    await expect(consumeRateLimit("test-ip:admin@test.local", limiter)).rejects.toThrow(/Too many attempts/);

    const { clearedLimiters } = resetDevRateLimitCaches();
    expect(clearedLimiters).toBeGreaterThan(0);

    const fresh = await getRateLimiter("login", 2, 60);
    await expect(consumeRateLimit("test-ip:admin@test.local", fresh)).resolves.toBeUndefined();
  });

  it("does nothing when ALLOW_DEV_RATE_LIMIT_RESET is not true", async () => {
    vi.stubEnv("ALLOW_DEV_RATE_LIMIT_RESET", "false");
    const { clearedLimiters } = resetDevRateLimitCaches();
    expect(clearedLimiters).toBe(0);
  });
});
