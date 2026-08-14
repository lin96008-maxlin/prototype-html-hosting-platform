import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { listUsers } from "@/lib/data";
import { query, withTransaction } from "@/lib/db";
import { getAllowedDepartmentIds } from "@/lib/department-scope";
import { demoStore } from "@/lib/demo-store";
import { isDemoMode } from "@/lib/env";
import { removeStoredFile, removeStoredPrototype } from "@/lib/file-storage";
import { rejectInvalidOrigin } from "@/lib/security";
import { readRequestJson } from "@/lib/request-json";

const schema = z.object({
  name: z.string().trim().min(1).max(40).optional(),
  departmentId: z.string().min(1).optional(),
  role: z.enum(["user", "admin", "super_admin"]).optional(),
  status: z.enum(["active", "disabled"]).optional(),
  storageQuotaBytes: z.number().int().min(5 * 1024 * 1024).max(1024 * 1024 * 1024 * 1024).optional(),
});

async function contextFor(request: Request, id: string) {
  const originError = rejectInvalidOrigin(request);
  if (originError) return { error: originError };
  const actor = await getCurrentUser();
  if (!actor || actor.role === "user") {
    return { error: NextResponse.json({ message: "无权操作" }, { status: 403 }) };
  }
  const target = (await listUsers()).find((item) => item.id === id);
  const allowed = await getAllowedDepartmentIds(actor);
  if (!target || (actor.role !== "super_admin" && (!allowed.has(target.departmentId) || target.role !== "user"))) {
    return { error: NextResponse.json({ message: "人员不存在或超出管理范围" }, { status: 404 }) };
  }
  return { actor, target, allowed };
}

async function wouldRemoveLastSuperAdmin(id: string, nextRole?: string, deleting = false) {
  if (isDemoMode) {
    const target = demoStore.users.find((item) => item.id === id);
    return Boolean(
      target?.role === "super_admin" &&
      (deleting || nextRole && nextRole !== "super_admin") &&
      demoStore.users.filter((item) => item.role === "super_admin").length <= 1,
    );
  }
  const result = await query<{ role: string; count: string }>(
    `select (select role::text from users where id = $1) as role,
            (select count(*) from users where role = 'super_admin')::text as count`,
    [id],
  );
  const row = result.rows[0];
  return Boolean(row?.role === "super_admin" && (deleting || nextRole && nextRole !== "super_admin") && Number(row.count) <= 1);
}

export async function PATCH(request: Request, routeContext: { params: Promise<{ id: string }> }) {
  const { id } = await routeContext.params;
  const info = await contextFor(request, id);
  if (info.error) return info.error;
  const parsed = schema.safeParse(await readRequestJson(request));
  if (!parsed.success) return NextResponse.json({ message: "人员设置无效" }, { status: 400 });
  if (info.actor!.role !== "super_admin" && parsed.data.role !== undefined) {
    return NextResponse.json({ message: "普通管理员不能修改用户角色" }, { status: 403 });
  }
  if (
    info.actor!.role !== "super_admin"
    && parsed.data.departmentId
    && !info.allowed!.has(parsed.data.departmentId)
  ) {
    return NextResponse.json({ message: "目标部门超出管理范围" }, { status: 403 });
  }
  if (id === info.actor!.id && parsed.data.status === "disabled") {
    return NextResponse.json({ message: "不能停用当前登录账号" }, { status: 400 });
  }
  if (await wouldRemoveLastSuperAdmin(id, parsed.data.role)) {
    return NextResponse.json({ message: "系统至少需要保留一名超级管理员" }, { status: 400 });
  }

  const targetDepartmentId = parsed.data.departmentId ?? info.target!.departmentId;
  if (isDemoMode) {
    const target = demoStore.users.find((item) => item.id === id)!;
    if (parsed.data.name) target.name = parsed.data.name;
    if (parsed.data.departmentId) {
      const department = demoStore.departments.find((item) => item.id === parsed.data.departmentId);
      if (!department) return NextResponse.json({ message: "部门不存在" }, { status: 400 });
      target.departmentId = department.id;
      target.departmentName = department.name;
      demoStore.projects.forEach((project) => {
        if (project.ownerId === target.id) {
          project.departmentId = department.id;
          project.departmentName = department.name;
        }
      });
    }
    if (parsed.data.role) target.role = parsed.data.role;
    if (parsed.data.status) target.status = parsed.data.status;
    if (parsed.data.storageQuotaBytes !== undefined) {
      target.storageQuotaBytes = parsed.data.storageQuotaBytes;
    }
    return NextResponse.json({ ok: true });
  }

  if (parsed.data.departmentId && !(await query("select 1 from departments where id = $1", [parsed.data.departmentId])).rows[0]) {
    return NextResponse.json({ message: "部门不存在" }, { status: 400 });
  }
  await withTransaction(async (client) => {
    const values: unknown[] = [];
    const assignments = ["updated_at = now()"];
    if (parsed.data.name) {
      values.push(parsed.data.name);
      assignments.push(`name = $${values.length}`);
    }
    if (parsed.data.departmentId) {
      values.push(parsed.data.departmentId);
      assignments.push(`department_id = $${values.length}`);
    }
    if (parsed.data.role) {
      values.push(parsed.data.role);
      assignments.push(`role = $${values.length}`);
    }
    if (parsed.data.status) {
      values.push(parsed.data.status);
      assignments.push(`status = $${values.length}`);
    }
    if (parsed.data.storageQuotaBytes !== undefined) {
      values.push(parsed.data.storageQuotaBytes);
      assignments.push(`storage_quota_bytes = $${values.length}`);
    }
    values.push(id);
    await client.query(`update users set ${assignments.join(", ")} where id = $${values.length}`, values);
    if (parsed.data.departmentId) {
      await client.query(
        "update projects set department_id = $1 where owner_id = $2",
        [parsed.data.departmentId, id],
      );
    }
    if (parsed.data.role === "admin") {
      await client.query("delete from admin_department_scopes where admin_id = $1", [id]);
      await client.query(
        "insert into admin_department_scopes (admin_id, department_id) values ($1, $2)",
        [id, targetDepartmentId],
      );
    } else if (parsed.data.role) {
      await client.query("delete from admin_department_scopes where admin_id = $1", [id]);
    } else if (parsed.data.departmentId && info.target!.role === "admin") {
      await client.query("delete from admin_department_scopes where admin_id = $1", [id]);
      await client.query(
        "insert into admin_department_scopes (admin_id, department_id) values ($1, $2)",
        [id, targetDepartmentId],
      );
    }
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request, routeContext: { params: Promise<{ id: string }> }) {
  const { id } = await routeContext.params;
  const info = await contextFor(request, id);
  if (info.error) return info.error;
  if (id === info.actor!.id) {
    return NextResponse.json({ message: "不能删除当前登录账号" }, { status: 400 });
  }
  if (await wouldRemoveLastSuperAdmin(id, undefined, true)) {
    return NextResponse.json({ message: "系统至少需要保留一名超级管理员" }, { status: 400 });
  }
  if (isDemoMode) {
    const projectIds = new Set(demoStore.projects.filter((item) => item.ownerId === id).map((item) => item.id));
    demoStore.projects = demoStore.projects.filter((item) => item.ownerId !== id);
    projectIds.forEach((projectId) => demoStore.sharePasswords.delete(projectId));
    const index = demoStore.users.findIndex((item) => item.id === id);
    if (index >= 0) demoStore.users.splice(index, 1);
    return NextResponse.json({ ok: true });
  }

  const projects = await withTransaction(async (client) => {
    const result = await client.query<{ html_path: string; preview_path: string | null }>(
      "select html_path, preview_path from projects where owner_id = $1 for update",
      [id],
    );
    await client.query("delete from users where id = $1", [id]);
    return result.rows;
  });
  await Promise.all(
    projects.flatMap((project) => [removeStoredPrototype(project.html_path), removeStoredFile(project.preview_path)]),
  ).catch((error) => console.error("已删除用户，但部分原型文件清理失败", error));
  return NextResponse.json({ ok: true });
}
