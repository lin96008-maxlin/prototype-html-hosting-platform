import { hash } from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { withTransaction } from "@/lib/db";
import { getAllowedDepartmentIds } from "@/lib/department-scope";
import { demoStore } from "@/lib/demo-store";
import { isDemoMode } from "@/lib/env";
import { readRequestJson } from "@/lib/request-json";
import { rejectInvalidOrigin } from "@/lib/security";
import {
  createTemporaryPassword,
  temporaryPasswordExpiry,
} from "@/lib/temp-password";
import type { UserProfile } from "@/lib/types";
import { DEFAULT_USER_STORAGE_QUOTA_BYTES } from "@/lib/storage-quota";

const schema = z.object({
  account: z.string().trim().regex(/^[a-zA-Z][a-zA-Z0-9_.-]{2,39}$/),
  name: z.string().trim().min(1).max(40),
  departmentId: z.string().min(1),
  role: z.enum(["user", "admin", "super_admin"]),
  status: z.enum(["active", "disabled"]),
  storageQuotaBytes: z.number().int().min(5 * 1024 * 1024).max(1024 * 1024 * 1024 * 1024)
    .default(DEFAULT_USER_STORAGE_QUOTA_BYTES),
});

export async function POST(request: Request) {
  const originError = rejectInvalidOrigin(request);
  if (originError) return originError;

  const actor = await getCurrentUser();
  if (!actor || actor.role === "user") {
    return NextResponse.json({ message: "无权操作" }, { status: 403 });
  }

  const parsed = schema.safeParse(await readRequestJson(request));
  if (!parsed.success) {
    return NextResponse.json({ message: "人员信息无效，请检查必填项和账号格式" }, { status: 400 });
  }
  if (actor.role !== "super_admin" && parsed.data.role !== "user") {
    return NextResponse.json({ message: "普通管理员只能创建普通用户" }, { status: 403 });
  }

  const allowedDepartments = await getAllowedDepartmentIds(actor);
  if (!allowedDepartments.has(parsed.data.departmentId)) {
    return NextResponse.json({ message: "目标部门超出管理范围" }, { status: 403 });
  }

  const account = parsed.data.account.toLowerCase();
  const department = isDemoMode
    ? demoStore.departments.find((item) => item.id === parsed.data.departmentId)
    : null;
  if (isDemoMode && !department) {
    return NextResponse.json({ message: "部门不存在" }, { status: 400 });
  }

  const tempPassword = createTemporaryPassword();
  const expiresAt = temporaryPasswordExpiry();
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();

  try {
    let user: UserProfile;
    if (isDemoMode) {
      if (demoStore.users.some((item) => item.account.toLowerCase() === account)) {
        return NextResponse.json({ message: "账号已存在" }, { status: 409 });
      }
      user = {
        id,
        account,
        name: parsed.data.name,
        departmentId: parsed.data.departmentId,
        departmentName: department!.name,
        role: parsed.data.role,
        status: parsed.data.status,
        mustChangePassword: true,
        tempPasswordExpiresAt: expiresAt,
        storageQuotaBytes: parsed.data.storageQuotaBytes,
        storageUsedBytes: 0,
        createdAt,
      };
      demoStore.users.unshift(user);
      demoStore.passwords.set(account, tempPassword);
    } else {
      user = await withTransaction(async (client) => {
        const result = await client.query<{
          id: string;
          account: string;
          name: string;
          department_id: string;
          department_name: string;
          role: UserProfile["role"];
          status: UserProfile["status"];
          must_change_password: boolean;
          temp_password_expires_at: string;
          storage_quota_bytes: string;
          created_at: string;
        }>(
          `insert into users (
             id, account, password_hash, name, department_id, role, status,
             must_change_password, temp_password_expires_at, storage_quota_bytes
           )
           select $1, $2, $3, $4, d.id, $6, $7, true, $8, $9
             from departments d
            where d.id = $5
           returning id, account::text, name, department_id,
             (select name from departments where id = department_id) as department_name,
             role, status, must_change_password, temp_password_expires_at,
             storage_quota_bytes::text, created_at`,
          [
            id,
            account,
            await hash(tempPassword, 10),
            parsed.data.name,
            parsed.data.departmentId,
            parsed.data.role,
            parsed.data.status,
            expiresAt,
            parsed.data.storageQuotaBytes,
          ],
        );
        const row = result.rows[0];
        if (!row) throw new Error("DEPARTMENT_NOT_FOUND");
        if (parsed.data.role === "admin") {
          await client.query(
            "insert into admin_department_scopes (admin_id, department_id) values ($1, $2)",
            [id, parsed.data.departmentId],
          );
        }
        return {
          id: String(row.id),
          account: String(row.account),
          name: String(row.name),
          departmentId: String(row.department_id),
          departmentName: String(row.department_name),
          role: row.role,
          status: row.status,
          mustChangePassword: Boolean(row.must_change_password),
          tempPasswordExpiresAt: String(row.temp_password_expires_at),
          storageQuotaBytes: Number(row.storage_quota_bytes),
          storageUsedBytes: 0,
          createdAt: String(row.created_at),
        };
      });
    }
    return NextResponse.json({ user, tempPassword, expiresAt }, { status: 201 });
  } catch (error) {
    const duplicate = typeof error === "object" && error && "code" in error && error.code === "23505";
    const missingDepartment = error instanceof Error && error.message === "DEPARTMENT_NOT_FOUND";
    return NextResponse.json(
      { message: duplicate ? "账号已存在" : missingDepartment ? "部门不存在" : "人员创建失败" },
      { status: duplicate ? 409 : 400 },
    );
  }
}
