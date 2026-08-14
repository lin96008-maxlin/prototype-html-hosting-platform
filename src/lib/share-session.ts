import { jwtVerify, SignJWT } from "jose";
import { env } from "@/lib/env";

function key() {
  if (process.env.NODE_ENV === "production" && !env.sessionSigningSecret) {
    throw new Error("生产环境缺少 SESSION_SIGNING_SECRET");
  }
  return new TextEncoder().encode(env.sessionSigningSecret || "local-demo-share-secret");
}

export function shareCookieName(projectId: string) {
  return `prototype_share_${projectId.replaceAll("-", "")}`;
}

export async function createShareGrant(
  projectId: string,
  visitorId: string,
  shareVersion: number,
  expiresAt?: string | null,
) {
  const expiration = expiresAt
    ? Math.min(Math.floor(new Date(expiresAt).getTime() / 1000), Math.floor(Date.now() / 1000) + 86400)
    : Math.floor(Date.now() / 1000) + 86400;
  return new SignJWT({ projectId, shareVersion })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(visitorId)
    .setIssuedAt()
    .setExpirationTime(expiration)
    .sign(key());
}

export async function verifyShareGrant(
  token: string | undefined,
  projectId: string,
  visitorId: string,
  shareVersion: number,
) {
  if (!token) return false;
  try {
    const { payload } = await jwtVerify(token, key());
    return payload.projectId === projectId
      && payload.sub === visitorId
      && payload.shareVersion === shareVersion;
  } catch {
    return false;
  }
}
