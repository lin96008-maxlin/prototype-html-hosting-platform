import { compare } from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";
import { withBasePath } from "@/lib/app-path";
import { DEMO_SESSION_COOKIE } from "@/lib/auth";
import { query } from "@/lib/db";
import { demoStore } from "@/lib/demo-store";
import { env, isDemoMode } from "@/lib/env";
import { getClientIp, rejectInvalidOrigin } from "@/lib/security";
import { readRequestJson } from "@/lib/request-json";
import { createSessionToken, SESSION_COOKIE, sessionCookieOptions } from "@/lib/session";

const schema = z.object({
  account: z.string().trim().min(2, "请输入账号").max(40),
  password: z.string().min(6, "请输入密码").max(128),
  returnTo: z.string().optional(),
});

function safeReturnTo(value?: string) {
  if (!value) return withBasePath("/projects");
  if (value.startsWith("/") && !value.startsWith("//")) return withBasePath(value);
  try {
    const url = new URL(value);
    const allowedOrigins = [env.demoUrl, env.manageUrl].map((item) => new URL(item).origin);
    if (allowedOrigins.includes(url.origin)) return value;
  } catch {
    return withBasePath("/projects");
  }
  return withBasePath("/projects");
}

export async function POST(request: Request) {
  const originError = rejectInvalidOrigin(request);
  if (originError) return originError;

  const parsed = schema.safeParse(await readRequestJson(request));
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message }, { status: 400 });
  }
  const account = parsed.data.account.toLowerCase();
  const ipAddress = getClientIp(request);

  if (isDemoMode) {
    const recentFailures = demoStore.loginLogs.filter((item) =>
      item.account === account
      && item.ipAddress === ipAddress
      && !item.success
      && new Date(item.createdAt).getTime() > Date.now() - 15 * 60_000,
    ).length;
    if (recentFailures >= 10) {
      return NextResponse.json({ message: "登录失败次数过多，请 15 分钟后再试" }, { status: 429 });
    }
    const user = demoStore.users.find((item) => item.account === account);
    const valid = user && demoStore.passwords.get(account) === parsed.data.password && user.status === "active";
    demoStore.loginLogs.unshift({
      id: crypto.randomUUID(),
      account,
      userName: user?.name ?? null,
      success: Boolean(valid),
      ipAddress,
      createdAt: new Date().toISOString(),
    });
    if (!valid) return NextResponse.json({ message: "账号或密码错误" }, { status: 401 });

    const response = NextResponse.json({
      next: user.mustChangePassword ? withBasePath("/change-password") : safeReturnTo(parsed.data.returnTo),
    });
    response.cookies.set(DEMO_SESSION_COOKIE, user.account, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      domain: env.authCookieDomain || undefined,
      maxAge: 60 * 60 * 12,
      path: "/",
    });
    return response;
  }

  const result = await query<{
    id: string;
    password_hash: string;
    status: "active" | "disabled";
    must_change_password: boolean;
    temp_password_expires_at: string | null;
    session_version: number;
  }>(
    `select id, password_hash, status, must_change_password, temp_password_expires_at, session_version
       from users where account = $1`,
    [account],
  );
  const user = result.rows[0];
  const recentFailures = await query<{ failures: string }>(
    `select count(*)::text as failures
       from login_logs
      where account = $1
        and ip_address is not distinct from $2::inet
        and success = false
        and created_at > now() - interval '15 minutes'`,
    [account, ipAddress],
  );
  if (Number(recentFailures.rows[0]?.failures ?? 0) >= 10) {
    return NextResponse.json({ message: "登录失败次数过多，请 15 分钟后再试" }, { status: 429 });
  }
  const passwordValid = user ? await compare(parsed.data.password, user.password_hash) : false;
  const tempExpired = Boolean(
    user?.temp_password_expires_at &&
      new Date(user.temp_password_expires_at).getTime() <= Date.now(),
  );
  const valid = Boolean(user && passwordValid && user.status === "active" && !tempExpired);

  await query(
    `insert into login_logs (user_id, account, success, ip_address, user_agent)
     values ($1, $2, $3, $4, $5)`,
    [user?.id ?? null, account, valid, ipAddress, request.headers.get("user-agent")],
  );

  if (!valid) {
    const message = tempExpired ? "临时密码已过期，请联系管理员重新生成" : "账号或密码错误";
    return NextResponse.json({ message }, { status: 401 });
  }

  const response = NextResponse.json({
    next: user.must_change_password ? withBasePath("/change-password") : safeReturnTo(parsed.data.returnTo),
  });
  response.cookies.set(
    SESSION_COOKIE,
    await createSessionToken(user.id, user.session_version),
    sessionCookieOptions(),
  );
  return response;
}
