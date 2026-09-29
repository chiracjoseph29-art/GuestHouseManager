import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { configState } = vi.hoisted(() => ({
  configState: {
    endpoint: "https://project-ref.storage.supabase.co/storage/v1/s3" as string | undefined,
    nodeEnv: "production",
  },
}));

vi.mock("@/server/config/env", () => ({
  getEnv: () => ({ STORAGE_S3_ENDPOINT: configState.endpoint }),
  isDevelopment: () => configState.nodeEnv === "development",
  isProduction: () => configState.nodeEnv === "production",
}));

import { middleware } from "@/middleware";

function getDirectives(endpoint: string | undefined) {
  configState.endpoint = endpoint;
  const response = middleware(new NextRequest("https://app.example/app"));
  const csp = response.headers.get("Content-Security-Policy");
  expect(csp).toBeTruthy();
  return csp!.split("; ");
}

describe("Supabase Storage image CSP source", () => {
  beforeEach(() => {
    configState.nodeEnv = "production";
    configState.endpoint = "https://project-ref.storage.supabase.co/storage/v1/s3";
  });

  it("allows only the configured Supabase Storage origin in img-src", () => {
    const directives = getDirectives(configState.endpoint);
    const imageDirective = directives.find((directive) => directive.startsWith("img-src "));

    expect(imageDirective).toBe(
      "img-src 'self' data: blob: https://project-ref.storage.supabase.co",
    );
    expect(imageDirective).not.toContain("*.supabase.co");
  });

  it("does not allow an arbitrary configured external origin", () => {
    const directives = getDirectives("https://attacker.example/storage/v1/s3");
    const imageDirective = directives.find((directive) => directive.startsWith("img-src "));

    expect(imageDirective).toBe("img-src 'self' data: blob:");
    expect(directives.join("; ")).not.toContain("https://attacker.example");
  });

  it("preserves development script and connect-src behavior", () => {
    configState.nodeEnv = "development";
    const directives = getDirectives("https://project-ref.storage.supabase.co/storage/v1/s3");

    expect(directives).toContain("connect-src 'self'");
    expect(directives.find((directive) => directive.startsWith("script-src "))).toContain("'unsafe-eval'");
    expect(directives.find((directive) => directive.startsWith("img-src "))).toContain(
      "https://project-ref.storage.supabase.co",
    );
  });
});