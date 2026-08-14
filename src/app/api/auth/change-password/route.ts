import { compare, hash } from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";
import { withBasePath } from "@/lib/app-path";
import { getCurrentUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { demoStore } from "@/lib/demo-store";
import { isDemoMode } from "@/lib/env";
import { rejectInvalidOrigin } from "@/lib/security";
import { readRequestJson } from "@/lib/request-json";
import { createSessionToken, SESSION_COOKIE, sessionCookieOptions } from "@/lib/session";

const schema = z
  .object({
    currentPassword: z.string().min(6, "请输入当前密码"),
    newPassword: z.string().min(8, "新密码至少8位").max(128),
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    path: ["confirmPassword"],
    message: "两次输入的新密码不一致",
  })
  .refine((data) => data.currentPassword !== data.newPassword, {
    path: ["newPassword"],
    message: "新密码不能与当前密码相同",
  });

export async function POST(request: Request) {
  const originError = rejectInvalidOrigin(request);
  if (originError) return originError;
  const user = await getCurrentUser({ allowMustChangePassword: true });
  if (!user) return NextResponse.json({ message: "登录状态已失效" }, { status: 401 });
  const parsed = schema.safeParse(await readRequestJson(request));
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message }, { status: 400 });
  }
  const input = parsed.data;

  if (isDemoMode) {
    if (demoStore.passwords.get(user.account) !== input.currentPassword) {
      return NextResponse.json({ message: "当前密码不正确" }, { status: 400 });
    }
    demoStore.passwords.set(user.account, input.newPassword);
    const storedUser = demoStore.users.find((item) => item.id === user.id)!;
    storedUser.mustChangePassword = false;
    storedUser.tempPasswordExpiresAt = null;
    return NextResponse.json({ next: withBasePath("/projects") });
  }

  const current = await query<{ password_hash: string }>(
    "select password_hash from users where id = $1",
    [user.id],
  );
  if (!current.rows[0] || !(await compare(input.currentPassword, current.rows[0].password_hash))) {
    return NextResponse.json({ message: "当前密码不正确" }, { status: 400 });
  }
  const updated = await query<{ session_version: number }>(
    `update users set password_hash = $1, must_change_password = false,
            temp_password_expires_at = null, session_version = session_version + 1,
            updated_at = now()
      where id = $2 returning session_version`,
    [await hash(input.newPassword, 10), user.id],
  );
  const response = NextResponse.json({ next: withBasePath("/projects") });
  response.cookies.set(
    SESSION_COOKIE,
    await createSessionToken(user.id, updated.rows[0].session_version),
    sessionCookieOptions(),
  );
  return response;
}
