"use client";

let csrfToken: string | null = null;

export async function ensureCsrf(): Promise<string> {
  if (csrfToken) return csrfToken;
  const res = await fetch("/api/v1/csrf", { credentials: "include" });
  const json = await res.json();
  csrfToken = json.data.csrfToken as string;
  return csrfToken!;
}

export async function api<T>(
  path: string,
  init: RequestInit & { skipCsrf?: boolean } = {},
): Promise<{ data: T; correlationId: string }> {
  const headers = new Headers(init.headers);
  if (!init.skipCsrf && init.method && init.method !== "GET") {
    headers.set("x-csrf-token", await ensureCsrf());
  }
  if (init.body && !(init.body instanceof FormData)) {
    headers.set("Content-Type", headers.get("Content-Type") ?? "application/json");
  }
  const res = await fetch(path, { ...init, headers, credentials: "include" });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json?.error?.message ?? "Unable to complete this request.");
  }
  return json;
}

export async function apiForm<T>(path: string, form: FormData): Promise<{ data: T }> {
  const token = await ensureCsrf();
  const res = await fetch(path, {
    method: "POST",
    body: form,
    credentials: "include",
    headers: { "x-csrf-token": token },
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error?.message ?? "Upload failed.");
  return json;
}

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: "ADMIN" | "MANAGER" | "CLEANER";
  canViewFinancials: boolean;
};

export async function fetchMe(): Promise<SessionUser | null> {
  const res = await fetch("/api/v1/auth/me", { credentials: "include" });
  const json = await res.json();
  return json.data?.user ?? null;
}

export function clearCsrfCache() {
  csrfToken = null;
}
