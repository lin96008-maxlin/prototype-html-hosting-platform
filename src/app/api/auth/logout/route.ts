import { NextResponse } from "next/server";
import { withBasePath } from "@/lib/app-path";
import { DEMO_SESSION_COOKIE } from "@/lib/auth";
import { env } from "@/lib/env";
import { rejectInvalidOrigin } from "@/lib/security";
import { SESSION_COOKIE } from "@/lib/session";

export async function POST(request: Request) {
  const originError = rejectInvalidOrigin(request);
  if (originError) return originError;
  const response = NextResponse.json({ next: withBasePath("/login") });
  const expired = {
    expires: new Date(0),
    domain: env.authCookieDomain || undefined,
    path: "/",
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
  };
  response.cookies.set(SESSION_COOKIE, "", expired);
  response.cookies.set(DEMO_SESSION_COOKIE, "", expired);
  return response;
}
