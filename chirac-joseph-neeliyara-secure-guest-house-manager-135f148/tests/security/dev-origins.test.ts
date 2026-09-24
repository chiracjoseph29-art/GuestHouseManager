import { describe, expect, it, afterEach } from "vitest";
import { resolveAllowedDevOrigins } from "@/server/config/dev-origins";

describe("resolveAllowedDevOrigins", () => {
  const prev = process.env.ALLOWED_DEV_ORIGINS;
  afterEach(() => {
    process.env.ALLOWED_DEV_ORIGINS = prev;
  });

  it("includes private LAN wildcard hostnames for mobile dev clients", () => {
    const origins = resolveAllowedDevOrigins();
    expect(origins).toContain("192.168.0.*");
    expect(origins).toContain("192.168.1.*");
  });

  it("merges ALLOWED_DEV_ORIGINS from env", () => {
    process.env.ALLOWED_DEV_ORIGINS = "phone.test.local,192.168.0.109";
    const origins = resolveAllowedDevOrigins();
    expect(origins).toContain("phone.test.local");
    expect(origins).toContain("192.168.0.109");
  });
});
