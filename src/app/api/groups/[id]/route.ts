import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { listGroups } from "@/lib/data";
import { query } from "@/lib/db";
import { demoStore } from "@/lib/demo-store";
import { isDemoMode } from "@/lib/env";
import { rejectInvalidOrigin } from "@/lib/security";
import { readRequestJson } from "@/lib/request-json";

const schema = z.object({
  name: z.string().trim().min(1).max(30).optional(),
  parentId: z.string().min(1).nullable().optional(),
}).refine((value) => value.name !== undefined || value.parentId !== undefined, {
  message: "没有需要保存的分组信息",
});

function descendantIds(groups: Awaited<ReturnType<typeof listGroups>>, rootId: string) {
  const result = new Set([rootId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const group of groups) {
      if (group.parentId && result.has(group.parentId) && !result.has(group.id)) {
        result.add(group.id);
        changed = true;
      }
    }
  }
  return result;
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const originError = rejectInvalidOrigin(request);
  if (originError) return originError;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ message: "请先登录" }, { status: 401 });
  const { id } = await context.params;
  const groups = await listGroups(user.id);
  const group = groups.find((item) => item.id === id);
  if (!group) return NextResponse.json({ message: "分组不存在" }, { status: 404 });
  const parsed = schema.safeParse(await readRequestJson(request));
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "分组信息无效" }, { status: 400 });
  }
  const input = parsed.data;
  if (input.parentId !== undefined) {
    const descendants = descendantIds(groups, id);
    if (input.parentId && descendants.has(input.parentId)) {
      return NextResponse.json({ message: "不能将分组移动到自身或下级分组" }, { status: 400 });
    }
    if (input.parentId && !groups.some((item) => item.id === input.parentId)) {
      return NextResponse.json({ message: "上级分组不存在" }, { status: 400 });
    }
  }
  const nextName = input.name ?? group.name;
  const nextParentId = input.parentId !== undefined ? input.parentId : group.parentId;
  if (groups.some((item) =>
    item.id !== group.id
    && item.parentId === nextParentId
    && item.name.toLocaleLowerCase("zh-CN") === nextName.toLocaleLowerCase("zh-CN"),
  )) {
    return NextResponse.json({ message: "同级分组名称已存在" }, { status: 409 });
  }

  try {
    if (isDemoMode) {
      if (input.name !== undefined) group.name = input.name;
      if (input.parentId !== undefined) group.parentId = input.parentId;
    } else {
      const values: unknown[] = [];
      const assignments = ["updated_at = now()"];
      if (input.name !== undefined) {
        values.push(input.name);
        assignments.push(`name = $${values.length}`);
      }
      if (input.parentId !== undefined) {
        values.push(input.parentId);
        assignments.push(`parent_id = $${values.length}`);
      }
      values.push(id, user.id);
      const result = await query(
        `update prototype_groups set ${assignments.join(", ")}
          where id = $${values.length - 1} and owner_id = $${values.length}
          returning id`,
        values,
      );
      if (!result.rows[0]) return NextResponse.json({ message: "分组不存在" }, { status: 404 });
    }
    return NextResponse.json({ group: { ...group, ...input } });
  } catch (error) {
    const duplicate = typeof error === "object" && error && "code" in error && error.code === "23505";
    return NextResponse.json(
      { message: duplicate ? "同级分组名称已存在" : "分组保存失败" },
      { status: duplicate ? 409 : 400 },
    );
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const originError = rejectInvalidOrigin(request);
  if (originError) return originError;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ message: "请先登录" }, { status: 401 });
  const { id } = await context.params;
  const groups = await listGroups(user.id);
  if (!groups.some((item) => item.id === id)) {
    return NextResponse.json({ message: "分组不存在" }, { status: 404 });
  }
  const hasChildren = groups.some((item) => item.parentId === id);
  const hasProjects = isDemoMode
    ? demoStore.projects.some((project) => project.ownerId === user.id && project.groupId === id)
    : Boolean((await query("select 1 from projects where owner_id = $1 and group_id = $2 limit 1", [user.id, id])).rows[0]);
  if (hasChildren || hasProjects) {
    return NextResponse.json(
      { message: "分组下存在子分组或原型，请先移动后再删除" },
      { status: 409 },
    );
  }
  if (isDemoMode) {
    const index = demoStore.groups.findIndex((item) => item.id === id && item.ownerId === user.id);
    if (index >= 0) demoStore.groups.splice(index, 1);
  } else {
    await query("delete from prototype_groups where id = $1 and owner_id = $2", [id, user.id]);
  }
  return NextResponse.json({ ok: true });
}
