import { describe, expect, it, vi } from "vitest";

const { poolState } = vi.hoisted(() => ({
  poolState: { options: null as Record<string, unknown> | null },
}));

vi.mock("pg", () => ({
  Pool: class MockPool {
    constructor(options: Record<string, unknown>) {
      poolState.options = options;
    }
  },
}));
vi.mock("@prisma/adapter-pg", () => ({
  PrismaPg: class MockPrismaPg {
    constructor(_pool: unknown) {}
  },
}));
vi.mock("@/generated/prisma/client", () => ({
  PrismaClient: class MockPrismaClient {
    constructor(_options: Record<string, unknown>) {}
  },
}));
vi.mock("@/server/config/env", () => ({
  getEnv: () => ({ DATABASE_URL: "postgresql://unused.invalid/test" }),
}));

import "@/server/db/prisma";

describe("runtime PostgreSQL pool configuration", () => {
  it("limits each application instance to one connection and keeps existing timeouts", () => {
    expect(poolState.options).toMatchObject({
      connectionString: "postgresql://unused.invalid/test",
      max: 1,
      keepAlive: true,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 15_000,
    });
  });
});