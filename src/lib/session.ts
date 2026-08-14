import { SignJWT, jwtVerify } from "jose";
import type { ResponseCookie } from "next/dist/compiled/@edge-runtime/cookies";
import { env } from "@/lib/env";

export const SESSION_COOKIE = "prototype_session";
const SESSION_MAX_AGE_SECONDS = 12 * 60 * 60;

function sessionSecret() {
  if (!env.sessionSigningSecret || env.sessionSigningSecret.length < 32) {
    throw new Error("SESSION_SIGNING_SECRET 至少需要 32 个字符");
  }
  return new TextEncoder().encode(env.sessionSigningSecret);
}

export async function createSessionToken(userId: string, sessionVersion: number) {
  return new SignJWT({ type: "session", sessionVersion })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE_SECONDS}s`)
    .sign(sessionSecret());
}

export async function verifySessionToken(token: string) {
  try {
    const { payload } = await jwtVerify(token, sessionSecret(), { algorithms: ["HS256"] });
    return payload.type === "session"
      && payload.sub
      && typeof payload.sessionVersion === "number"
      ? { userId: payload.sub, sessionVersion: payload.sessionVersion }
      : null;
  } catch {
    return null;
  }
}

export function sessionCookieOptions(): Partial<ResponseCookie> {
  return {
    domain: env.authCookieDomain || undefined,
    path: "/",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_MAX_AGE_SECONDS,
    priority: "high",
  };
}
