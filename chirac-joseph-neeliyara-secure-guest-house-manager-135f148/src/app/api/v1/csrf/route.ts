import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { getEnv } from "@/server/config/env";
import { CSRF_COOKIE } from "@/server/http/api-handler";

export async function GET() {
  const token = randomBytes(32).toString("base64url");
  const response = NextResponse.json({ data: { csrfToken: token } });
  response.cookies.set(CSRF_COOKIE, token, {
    httpOnly: false,
    secure: getEnv().COOKIE_SECURE,
    sameSite: "lax",
    path: "/",
  });
  return response;
}
