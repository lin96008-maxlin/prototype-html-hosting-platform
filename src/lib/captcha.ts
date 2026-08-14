import { randomInt } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { env } from "@/lib/env";

function secret() {
  if (process.env.NODE_ENV === "production" && (!env.sessionSigningSecret || env.sessionSigningSecret.length < 32)) {
    throw new Error("生产环境 SESSION_SIGNING_SECRET 至少需要 32 个字符");
  }
  return new TextEncoder().encode(env.sessionSigningSecret ?? "prototype-local-demo-signing-secret-change-me");
}

export function createCaptchaText() {
  const chars = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  return Array.from({ length: 4 }, () => chars[randomInt(chars.length)]).join("");
}

export async function createCaptchaToken(answer: string) {
  return new SignJWT({ answer: answer.toUpperCase() })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(secret());
}

export async function verifyCaptchaToken(token: string | undefined, answer: string) {
  if (!token) return false;
  try {
    const { payload } = await jwtVerify(token, secret());
    return payload.answer === answer.trim().toUpperCase();
  } catch {
    return false;
  }
}

export function createCaptchaSvg(answer: string) {
  const lines = Array.from({ length: 5 }, (_, index) => {
    const y = 5 + index * 6;
    return `<path d="M0 ${y} C 24 ${y + 8}, 68 ${y - 7}, 96 ${y + 3}" stroke="#${index % 2 ? "8EA1C2" : "5D78A7"}" stroke-opacity=".35" fill="none"/>`;
  }).join("");
  const text = answer
    .split("")
    .map(
      (char, index) =>
        `<text x="${14 + index * 21}" y="23" font-size="18" font-family="Arial" font-weight="700" fill="#223355" transform="rotate(${index % 2 ? 7 : -6} ${14 + index * 21} 23)">${char}</text>`,
    )
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="32" viewBox="0 0 96 32"><rect width="96" height="32" rx="4" fill="#F5F7FA"/>${lines}${text}</svg>`;
}
