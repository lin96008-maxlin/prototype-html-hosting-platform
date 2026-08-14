import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { demoStore } from "@/lib/demo-store";
import { isDemoMode } from "@/lib/env";
import { rejectInvalidOrigin } from "@/lib/security";
import { readRequestJson } from "@/lib/request-json";

const schema = z.object({
  name: z.string().trim().min(1).max(40),
  parentId: z.string().min(1).nullable().optional(),
});

export async function POST(request: Request) {
  const originError = rejectInvalidOrigin(request);
  if (originError) return originError;
  const user = await getCurrentUser();
  if (!user || user.role !== "super_admin") {
    return NextResponse.json({ message: "仅超级管理员可维护部门" }, { status: 403 });
  }
  const parsed = schema.safeParse(await readRequestJson(request));
  if (!parsed.success) return NextResponse.json({ message: "部门信息无效" }, { status: 400 });
  const department = {
    id: crypto.randomUUID(),
    name: parsed.data.name,
    parentId: parsed.data.parentId ?? null,
    sortOrder: 999,
  };
  try {
    if (isDemoMode) {
      if (department.parentId && !demoStore.departments.some((item) => item.id === department.parentId)) {
        return NextResponse.json({ message: "上级部门不存在" }, { status: 400 });
      }
      if (demoStore.departments.some((item) =>
        item.parentId === department.parentId
        && item.name.toLocaleLowerCase("zh-CN") === department.name.toLocaleLowerCase("zh-CN"),
      )) {
        return NextResponse.json({ message: "同级部门名称已存在" }, { status: 409 });
      }
      demoStore.departments.push(department);
    } else {
      if (department.parentId && !(await query("select 1 from departments where id = $1", [department.parentId])).rows[0]) {
        return NextResponse.json({ message: "上级部门不存在" }, { status: 400 });
      }
      await query(
        "insert into departments (id, name, parent_id, sort_order) values ($1, $2, $3, $4)",
        [department.id, department.name, department.parentId, department.sortOrder],
      );
    }
    return NextResponse.json({ department });
  } catch (error) {
    const duplicate = typeof error === "object" && error && "code" in error && error.code === "23505";
    return NextResponse.json({ message: duplicate ? "同级部门名称已存在" : "部门创建失败" }, { status: duplicate ? 409 : 400 });
  }
}
