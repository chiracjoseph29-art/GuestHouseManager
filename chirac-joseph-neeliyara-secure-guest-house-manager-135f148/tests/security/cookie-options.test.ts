import "dotenv/config";
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { resetEnvCacheForTests } from "@/server/config/env";
import {
  resolveCookieDomain,
  resolveCookieSecure,
  sessionCookieOptions,
} from "@/server/http/cookie-options";

describe("resolveCookieSecure", () => {
  const prev = process.env.COOKIE_SECURE;

  beforeEach(() => {
    resetEnvCacheForTests();
  });

  afterEach(() => {
    process.env.COOKIE_SECURE = prev;
    resetEnvCacheForTests();
  });

  function headers(host: string, proto?: string) {
    const h = new Headers();
    h.set("host", host);
    if (proto) h.set("x-forwarded-proto", proto);
    return h;
  }

  it("is false for LAN HTTP when COOKIE_SECURE is unset", () => {
    process.env.COOKIE_SECURE = "";
    expect(resolveCookieSecure({ headers: headers("192.168.0.107:3847") })).toBe(false);
  });

  it("is false for LAN HTTP even when COOKIE_SECURE=true in dev", () => {
    process.env.COOKIE_SECURE = "true";
    expect(resolveCookieSecure({ headers: headers("192.168.0.107:3847") })).toBe(false);
  });

  it("allows Secure on localhost in dev when COOKIE_SECURE=true", () => {
    process.env.COOKIE_SECURE = "true";
    expect(resolveCookieSecure({ headers: headers("localhost:3847") })).toBe(true);
  });

  it("is true for HTTPS in dev when COOKIE_SECURE=true", () => {
    process.env.COOKIE_SECURE = "true";
    expect(resolveCookieSecure({ headers: headers("192.168.0.107:3847", "https") })).toBe(true);
  });

  it("session cookie omits Secure on LAN HTTP in dev", () => {
    process.env.COOKIE_SECURE = "true";
    const opts = sessionCookieOptions({ headers: headers("192.168.0.107:3847") }, { maxAge: 3600 });
    expect(opts.secure).toBe(false);
    expect(opts.httpOnly).toBe(true);
    expect(opts.sameSite).toBe("lax");
    expect(opts.path).toBe("/");
    expect(opts.maxAge).toBe(3600);
  });

  it("session cookie uses Secure on localhost HTTP in dev when COOKIE_SECURE=true", () => {
    process.env.COOKIE_SECURE = "true";
    const opts = sessionCookieOptions({ headers: headers("localhost:3847") }, { maxAge: 3600 });
    expect(opts.secure).toBe(true);
  });

  it("ignores COOKIE_DOMAIN for IP literal hosts", () => {
    process.env.COOKIE_DOMAIN = "localhost";
    resetEnvCacheForTests();
    expect(resolveCookieDomain({ headers: headers("192.168.0.107:3847") })).toBeUndefined();
    const opts = sessionCookieOptions({ headers: headers("192.168.0.107:3847") }, { maxAge: 3600 });
    expect(opts).not.toHaveProperty("domain");
  });
});
