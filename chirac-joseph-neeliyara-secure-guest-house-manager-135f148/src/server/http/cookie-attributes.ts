/**
 * Parse Set-Cookie attribute flags without exposing the cookie value.
 */
export type CookieAttributeReport = {
  name: string;
  hasSecure: boolean;
  hasHttpOnly: boolean;
  sameSite: string | null;
  domain: string | null;
  path: string | null;
  hasMaxAge: boolean;
  hasExpires: boolean;
  maxAge: number | null;
};

export function describeSetCookieAttributes(setCookieHeader: string): CookieAttributeReport | null {
  const line = setCookieHeader.split(/,(?=\s*[^;=]+=)/)[0]?.trim() ?? setCookieHeader.trim();
  if (!line) return null;
  const [pair, ...attrs] = line.split(";").map((p) => p.trim());
  const name = pair?.split("=")[0] ?? "";
  if (!name) return null;

  let sameSite: string | null = null;
  let domain: string | null = null;
  let path: string | null = null;
  let maxAge: number | null = null;
  let hasSecure = false;
  let hasHttpOnly = false;
  let hasMaxAge = false;
  let hasExpires = false;

  for (const attr of attrs) {
    const lower = attr.toLowerCase();
    if (lower === "secure") hasSecure = true;
    else if (lower === "httponly") hasHttpOnly = true;
    else if (lower.startsWith("samesite=")) sameSite = attr.slice("samesite=".length);
    else if (lower.startsWith("domain=")) domain = attr.slice("domain=".length).toLowerCase();
    else if (lower.startsWith("path=")) path = attr.slice("path=".length);
    else if (lower.startsWith("max-age=")) {
      hasMaxAge = true;
      const n = Number(attr.slice("max-age=".length));
      maxAge = Number.isFinite(n) ? n : null;
    } else if (lower.startsWith("expires=")) hasExpires = true;
  }

  return { name, hasSecure, hasHttpOnly, sameSite, domain, path, hasMaxAge, hasExpires, maxAge };
}

export function isIpLiteralHost(hostHeader: string): boolean {
  const host = hostHeader.split(",")[0]?.trim().split(":")[0] ?? "";
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(host);
}
