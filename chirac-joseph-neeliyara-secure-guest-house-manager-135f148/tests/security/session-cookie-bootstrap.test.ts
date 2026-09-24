import "dotenv/config";
import { describe, expect, it } from "vitest";
import { describeSetCookieAttributes, isIpLiteralHost } from "@/server/http/cookie-attributes";
import {
  clearSessionBootstrapsForTests,
  consumeSessionBootstrap,
  issueSessionBootstrap,
} from "@/server/modules/auth/session-bootstrap";
import { needsSessionCookieBootstrap } from "@/server/http/cookie-options";
import { NextRequest, NextResponse } from "next/server";
import { attachSessionCookie, SESSION_COOKIE } from "@/server/modules/auth/session.service";
import { resetEnvCacheForTests } from "@/server/config/env";

describe("describeSetCookieAttributes", () => {
  it("reports attributes without exposing the cookie value", () => {
    const report = describeSetCookieAttributes(
      `${SESSION_COOKIE}=SECRET_SHOULD_NOT_APPEAR; Path=/; Max-Age=14400; HttpOnly; SameSite=lax`,
    );
    expect(report).toMatchObject({
      name: SESSION_COOKIE,
      hasSecure: false,
      hasHttpOnly: true,
      sameSite: "lax",
      domain: null,
      path: "/",
      hasMaxAge: true,
      maxAge: 14400,
    });
    expect(JSON.stringify(report)).not.toContain("SECRET");
  });
});

describe("LAN session cookie wire format", () => {
  it("sets Max-Age, HttpOnly, SameSite=lax, no Secure, no Domain for LAN HTTP", () => {
    process.env.COOKIE_SECURE = "false";
    resetEnvCacheForTests();
    const req = new NextRequest("http://192.168.0.107:3847/api/v1/auth/login", {
      headers: { host: "192.168.0.107:3847" },
    });
    const response = NextResponse.json({ ok: true });
    attachSessionCookie(response, req, {
      token: "test-session-token-value",
      expiresAt: new Date(Date.now() + 3_600_000),
    });
    const line = (response.headers.getSetCookie?.() ?? []).find((l) =>
      l.startsWith(`${SESSION_COOKIE}=`),
    );
    expect(line).toBeTruthy();
    const attrs = describeSetCookieAttributes(line!);
    expect(attrs?.hasSecure).toBe(false);
    expect(attrs?.hasHttpOnly).toBe(true);
    expect(attrs?.sameSite?.toLowerCase()).toBe("lax");
    expect(attrs?.domain).toBeNull();
    expect(attrs?.path).toBe("/");
    expect(attrs?.hasMaxAge).toBe(true);
  });
});

describe("session bootstrap", () => {
  it("issues a one-time token and consumes it once", () => {
    clearSessionBootstrapsForTests();
    const token = issueSessionBootstrap("raw-session", new Date(Date.now() + 60_000));
    expect(consumeSessionBootstrap(token)?.sessionToken).toBe("raw-session");
    expect(consumeSessionBootstrap(token)).toBeNull();
  });

  it("needs bootstrap only for non-secure IP hosts in development", () => {
    process.env.COOKIE_SECURE = "false";
    resetEnvCacheForTests();
    expect(isIpLiteralHost("192.168.0.107:3847")).toBe(true);
    expect(
      needsSessionCookieBootstrap({
        headers: new Headers({ host: "192.168.0.107:3847" }),
      }),
    ).toBe(true);
    expect(
      needsSessionCookieBootstrap({
        headers: new Headers({ host: "localhost:3847" }),
      }),
    ).toBe(false);
  });
});
