import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { CSRF_COOKIE } from "@/server/http/api-handler";
import { csrfCookieOptions } from "@/server/http/cookie-options";
import { headers } from "next/headers";

export async function GET() {
  const token = randomBytes(32).toString("base64url");
  const response = NextResponse.json({ data: { csrfToken: token } });
  const headerStore = await headers();
  response.cookies.set(CSRF_COOKIE, token, csrfCookieOptions({ headers: headerStore }));
  return response;
}
