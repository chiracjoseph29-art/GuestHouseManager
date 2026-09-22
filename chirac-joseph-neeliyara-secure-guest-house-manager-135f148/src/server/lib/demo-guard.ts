import { getEnv, isProduction } from "@/server/config/env";
import { AuthError } from "@/server/lib/errors";

const DEMO_EMAILS = new Set([
  "admin@guesthouse.local",
  "manager@guesthouse.local",
  "cleaner@guesthouse.local",
]);

export function assertNotDemoAccountInProduction(email: string): void {
  if (!isProduction()) return;
  const normalized = email.trim().toLowerCase();
  if (DEMO_EMAILS.has(normalized)) {
    throw new AuthError("Invalid email or password.");
  }
  if (process.env.DISALLOW_KNOWN_DEMO_ACCOUNTS === "true" && DEMO_EMAILS.has(normalized)) {
    throw new AuthError("Invalid email or password.");
  }
}

export function assertSeedAllowed(): void {
  const env = getEnv();
  if (env.NODE_ENV === "production") {
    throw new Error("Database seed is disabled in production.");
  }
}
