import "dotenv/config";
import { describe, expect, it, afterEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { resetEnvCacheForTests } from "@/server/config/env";
import { attachSessionCookie, SESSION_COOKIE } from "@/server/modules/auth/session.service";

describe("login session Set-Cookie", () => {
  it("attaches ghms_session to the login JSON response for LAN host", () => {
    const req = new NextRequest("http://192.168.0.107:3847/api/v1/auth/login", {
      headers: { host: "192.168.0.107:3847" },
    });
    const response = NextResponse.json({ data: { status: "session" } });
    const expiresAt = new Date(Date.now() + 60_000);
    attachSessionCookie(response, req, { token: "test-session-token-value", expiresAt });

    const setCookie = response.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain(`${SESSION_COOKIE}=`);
    expect(setCookie.toLowerCase()).not.toContain("secure");
  });

  const prevSecure = process.env.COOKIE_SECURE;
  afterEach(() => {
    process.env.COOKIE_SECURE = prevSecure;
    resetEnvCacheForTests();
  });

  it("attaches Secure session cookie for localhost when COOKIE_SECURE=true", () => {
    process.env.COOKIE_SECURE = "true";
    resetEnvCacheForTests();

    const req = new NextRequest("http://localhost:3847/api/v1/auth/login", {
      headers: { host: "localhost:3847" },
    });
    const response = NextResponse.json({ ok: true });
    attachSessionCookie(response, req, {
      token: "test-session-token-value",
      expiresAt: new Date(Date.now() + 60_000),
    });
    const setCookie = response.headers.get("set-cookie") ?? "";
    expect(setCookie.toLowerCase()).toContain("secure");
  });
});
