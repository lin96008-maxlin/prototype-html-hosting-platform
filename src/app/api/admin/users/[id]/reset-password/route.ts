import { hash } from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { listUsers } from "@/lib/data";
import { query } from "@/lib/db";
import { getAllowedDepartmentIds } from "@/lib/department-scope";
import { demoStore } from "@/lib/demo-store";
import { isDemoMode } from "@/lib/env";
import { rejectInvalidOrigin } from "@/lib/security";
import { readRequestJson } from "@/lib/request-json";
import { createTemporaryPassword, temporaryPasswordExpiry } from "@/lib/temp-password";

const schema = z.object({ password: z.string().min(10).max(64).optional() });

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const originError = rejectInvalidOrigin(request);
  if (originError) return originError;
  const actor = await getCurrentUser();
  if (!actor || actor.role === "user") return NextResponse.json({ message: "无权操作" }, { status: 403 });
  const { id } = await context.params;
  const target = (await listUsers()).find((item) => item.id === id);
  const allowed = await getAllowedDepartmentIds(actor);
  if (!target || (actor.role !== "super_admin" && (!allowed.has(target.departmentId) || target.role !== "user"))) {
    return NextResponse.json({ message: "人员不存在或超出管理范围" }, { status: 404 });
  }
  const parsed = schema.safeParse(await readRequestJson(request));
  if (!parsed.success) return NextResponse.json({ message: "临时密码至少 10 位" }, { status: 400 });
  const tempPassword = parsed.data.password || createTemporaryPassword();
  const expiresAt = temporaryPasswordExpiry();
  if (isDemoMode) {
    demoStore.passwords.set(target.account, tempPassword);
    const storedTarget = demoStore.users.find((item) => item.id === target.id)!;
    storedTarget.mustChangePassword = true;
    storedTarget.tempPasswordExpiresAt = expiresAt;
  } else {
    await query(
      `update users set password_hash = $1, must_change_password = true,
              temp_password_expires_at = $2, session_version = session_version + 1,
              updated_at = now()
        where id = $3`,
      [await hash(tempPassword, 10), expiresAt, id],
    );
  }
  return NextResponse.json({ tempPassword, expiresAt });
}
