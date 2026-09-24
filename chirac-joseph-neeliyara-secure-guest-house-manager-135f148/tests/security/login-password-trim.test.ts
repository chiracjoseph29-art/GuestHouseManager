import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "@/server/lib/crypto";

describe("login password whitespace normalization", () => {
  it("trimmed password matches the stored hash (mobile paste / keyboard trailing space)", async () => {
    const plain = "ChangeMeOnFirstLogin!";
    const hash = await hashPassword(plain);
    expect(await verifyPassword(hash, plain)).toBe(true);
    expect(await verifyPassword(hash, ` ${plain} `)).toBe(false);
    expect(await verifyPassword(hash, ` ${plain} `.trim())).toBe(true);
  });
});
