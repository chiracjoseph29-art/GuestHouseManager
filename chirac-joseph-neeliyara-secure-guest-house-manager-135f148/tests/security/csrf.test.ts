import { describe, it, expect } from "vitest";
import "dotenv/config";
import { NextRequest } from "next/server";
import { assertCsrf, CSRF_COOKIE, CSRF_HEADER } from "@/server/http/api-handler";
import { AuthError } from "@/server/lib/errors";

describe("CSRF", () => {
  it("rejects mutation without header", async () => {
    const req = new NextRequest("http://localhost/api/v1/auth/logout", {
      method: "POST",
      headers: { cookie: `${CSRF_COOKIE}=abc` },
    });
    await expect(assertCsrf(req)).rejects.toThrow(AuthError);
  });

  it("rejects mismatched token", async () => {
    const req = new NextRequest("http://localhost/api/v1/auth/logout", {
      method: "POST",
      headers: {
        cookie: `${CSRF_COOKIE}=token-a`,
        [CSRF_HEADER]: "token-b",
      },
    });
    await expect(assertCsrf(req)).rejects.toThrow(AuthError);
  });

  it("accepts matching token", async () => {
    const req = new NextRequest("http://localhost/api/v1/auth/logout", {
      method: "POST",
      headers: {
        cookie: `${CSRF_COOKIE}=same-token`,
        [CSRF_HEADER]: "same-token",
      },
    });
    await expect(assertCsrf(req)).resolves.toBeUndefined();
  });

  it("skips GET requests", async () => {
    const req = new NextRequest("http://localhost/api/v1/bookings", { method: "GET" });
    await expect(assertCsrf(req)).resolves.toBeUndefined();
  });
});
