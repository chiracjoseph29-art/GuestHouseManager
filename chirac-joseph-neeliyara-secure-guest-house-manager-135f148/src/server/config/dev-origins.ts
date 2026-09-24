/**
 * Hostnames allowed to load Next.js dev-only assets (/_next/*, HMR) from non-localhost clients.
 * Without this, mobile Safari on LAN often fails to hydrate — forms fall back to GET /login?.
 */
export function resolveAllowedDevOrigins(): string[] {
  const fromEnv = (process.env.ALLOWED_DEV_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const lanWildcards = ["192.168.0.*", "192.168.1.*", "10.0.*.*", "172.16.*.*"];

  return [...new Set([...fromEnv, ...lanWildcards])];
}
