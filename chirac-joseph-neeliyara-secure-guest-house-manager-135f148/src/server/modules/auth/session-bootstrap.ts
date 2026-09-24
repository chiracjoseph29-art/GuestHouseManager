import { generateSecureToken } from "@/server/lib/crypto";

type BootstrapEntry = {
  sessionToken: string;
  expiresAtMs: number;
  expiresAtCookie: Date;
};

/** Short-lived one-time tokens so Safari can set the session cookie via top-level navigation on LAN HTTP. */
const bootstraps = new Map<string, BootstrapEntry>();
const BOOTSTRAP_TTL_MS = 60_000;

function prune(): void {
  const now = Date.now();
  for (const [key, entry] of bootstraps) {
    if (entry.expiresAtMs <= now) bootstraps.delete(key);
  }
}

export function issueSessionBootstrap(
  sessionToken: string,
  cookieExpiresAt: Date,
): string {
  prune();
  const token = generateSecureToken(24);
  bootstraps.set(token, {
    sessionToken,
    expiresAtMs: Date.now() + BOOTSTRAP_TTL_MS,
    expiresAtCookie: cookieExpiresAt,
  });
  return token;
}

export function consumeSessionBootstrap(
  token: string,
): { sessionToken: string; cookieExpiresAt: Date } | null {
  prune();
  const entry = bootstraps.get(token);
  if (!entry) return null;
  bootstraps.delete(token);
  if (entry.expiresAtMs <= Date.now()) return null;
  return { sessionToken: entry.sessionToken, cookieExpiresAt: entry.expiresAtCookie };
}

/** @internal tests */
export function clearSessionBootstrapsForTests(): void {
  bootstraps.clear();
}
