import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { resolveClientIp } from "@/server/lib/client-meta";

describe("resolveClientIp", () => {
  it("prefers x-forwarded-for first hop", () => {
    const req = new NextRequest("http://localhost/api", {
      headers: { "x-forwarded-for": "192.168.0.109, 10.0.0.1" },
    });
    expect(resolveClientIp(req)).toBe("192.168.0.109");
  });

  it("falls back to x-real-ip", () => {
    const req = new NextRequest("http://localhost/api", {
      headers: { "x-real-ip": "192.168.0.55" },
    });
    expect(resolveClientIp(req)).toBe("192.168.0.55");
  });
});
