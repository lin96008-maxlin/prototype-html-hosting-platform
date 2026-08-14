import { hash } from "bcryptjs";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { withBasePath } from "@/lib/app-path";
import { DEMO_SESSION_COOKIE } from "@/lib/auth";
import { verifyCaptchaToken } from "@/lib/captcha";
import { withTransaction } from "@/lib/db";
import { demoStore } from "@/lib/demo-store";
import { env, isDemoMode } from "@/lib/env";
import { getClientIp, rejectInvalidOrigin } from "@/lib/security";
import { readRequestJson } from "@/lib/request-json";
import { createSessionToken, SESSION_COOKIE, sessionCookieOptions } from "@/lib/session";
import { DEFAULT_USER_STORAGE_QUOTA_BYTES } from "@/lib/storage-quota";

const schema = z
  .object({
    account: z.string().trim().regex(/^[a-zA-Z][a-zA-Z0-9_.-]{2,39}$/, "账号须以字母开头，长度为3至40位"),
    name: z.string().trim().min(2, "请输入姓名").max(20),
    departmentId: z.string().min(1, "请选择部门"),
    password: z.string().min(8, "密码至少8位").max(128),
    confirmPassword: z.string(),
    captcha: z.string().length(4, "请输入4位验证码"),
    invitationCode: z.string().trim().min(6, "请输入邀请码"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    path: ["confirmPassword"],
    message: "两次输入的密码不一致",
  });

export async function POST(request: Request) {
  const originError = rejectInvalidOrigin(request);
  if (originError) return originError;
  const parsed = schema.safeParse(await readRequestJson(request));
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message }, { status: 400 });
  }

  const captchaValid = await verifyCaptchaToken(
    (await cookies()).get("prototype_captcha")?.value,
    parsed.data.captcha,
  );
  if (!captchaValid) {
    return NextResponse.json({ message: "验证码错误或已失效" }, { status: 400 });
  }

  const input = { ...parsed.data, account: parsed.data.account.toLowerCase() };
  const invitationCode = input.invitationCode.toUpperCase();
  const ipAddress = getClientIp(request);
  if (isDemoMode) {
    const invitation = demoStore.invitations.find(
      (item) => item.code.toUpperCase() === invitationCode,
    );
    if (!invitation || invitation.usedAt || new Date(invitation.expiresAt).getTime() <= Date.now()) {
      return NextResponse.json({ message: "邀请码无效、已使用或已过期" }, { status: 400 });
    }
    if (demoStore.users.some((user) => user.account === input.account)) {
      return NextResponse.json({ message: "该账号已存在" }, { status: 409 });
    }
    const department = demoStore.departments.find((item) => item.id === input.departmentId);
    if (!department) return NextResponse.json({ message: "所选部门不存在" }, { status: 400 });
    const id = crypto.randomUUID();
    demoStore.users.push({
      id,
      account: input.account,
      name: input.name,
      departmentId: department.id,
      departmentName: department.name,
      role: "user",
      status: "active",
      mustChangePassword: false,
      tempPasswordExpiresAt: null,
      storageQuotaBytes: DEFAULT_USER_STORAGE_QUOTA_BYTES,
      createdAt: new Date().toISOString(),
    });
    demoStore.passwords.set(input.account, input.password);
    invitation.usedAt = new Date().toISOString();
    invitation.usedByName = input.name;
    demoStore.loginLogs.unshift({
      id: crypto.randomUUID(),
      account: input.account,
      userName: input.name,
      success: true,
      ipAddress,
      createdAt: new Date().toISOString(),
    });
    const response = NextResponse.json({ next: withBasePath("/projects") });
    response.cookies.set(DEMO_SESSION_COOKIE, input.account, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      domain: env.authCookieDomain || undefined,
      maxAge: 60 * 60 * 12,
      path: "/",
    });
    response.cookies.set("prototype_captcha", "", { expires: new Date(0), path: "/" });
    return response;
  }

  try {
    const userId = await withTransaction(async (client) => {
      const invitation = await client.query(
        `select id from invitation_codes
          where code = $1 and used_at is null and expires_at > now()
          for update`,
        [invitationCode],
      );
      if (!invitation.rows[0]) throw new Error("INVITATION_INVALID");
      const department = await client.query("select 1 from departments where id = $1", [input.departmentId]);
      if (!department.rows[0]) throw new Error("DEPARTMENT_INVALID");
      const created = await client.query(
        `insert into users (account, password_hash, name, department_id)
         values ($1, $2, $3, $4) returning id`,
        [input.account, await hash(input.password, 10), input.name, input.departmentId],
      );
      const id = String(created.rows[0].id);
      await client.query(
        "update invitation_codes set used_at = now(), used_by = $1, used_by_name = $2 where id = $3",
        [id, input.name, invitation.rows[0].id],
      );
      await client.query(
        `insert into login_logs (user_id, account, success, ip_address, user_agent)
         values ($1, $2, true, $3, $4)`,
        [id, input.account, ipAddress, request.headers.get("user-agent")],
      );
      return id;
    });
    const response = NextResponse.json({ next: withBasePath("/projects") });
    response.cookies.set(SESSION_COOKIE, await createSessionToken(userId, 1), sessionCookieOptions());
    response.cookies.set("prototype_captcha", "", { expires: new Date(0), path: "/" });
    return response;
  } catch (error) {
    if (error instanceof Error && error.message === "INVITATION_INVALID") {
      return NextResponse.json({ message: "邀请码无效、已使用或已过期" }, { status: 400 });
    }
    if (error instanceof Error && error.message === "DEPARTMENT_INVALID") {
      return NextResponse.json({ message: "所选部门不存在" }, { status: 400 });
    }
    if (typeof error === "object" && error && "code" in error && error.code === "23505") {
      return NextResponse.json({ message: "该账号已存在" }, { status: 409 });
    }
    console.error("注册失败", error);
    return NextResponse.json({ message: "注册失败，请稍后重试" }, { status: 500 });
  }
}
