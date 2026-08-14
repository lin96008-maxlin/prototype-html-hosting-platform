import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { demoStore } from "@/lib/demo-store";
import { isDemoMode } from "@/lib/env";
import { rejectInvalidOrigin } from "@/lib/security";
import { readRequestJson } from "@/lib/request-json";

const schema = z.object({
  name: z.string().trim().min(1, "请输入分组名称").max(30),
  parentId: z.string().min(1).nullable().optional(),
});

export async function POST(request: Request) {
  const originError = rejectInvalidOrigin(request);
  if (originError) return originError;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ message: "请先登录" }, { status: 401 });
  const parsed = schema.safeParse(await readRequestJson(request));
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message }, { status: 400 });
  }
  const group = {
    id: crypto.randomUUID(),
    ownerId: user.id,
    parentId: parsed.data.parentId ?? null,
    name: parsed.data.name,
    sortOrder: 999,
  };
  if (isDemoMode) {
    if (group.parentId && !demoStore.groups.some((item) => item.id === group.parentId && item.ownerId === user.id)) {
      return NextResponse.json({ message: "上级分组不存在" }, { status: 400 });
    }
    if (demoStore.groups.some((item) => item.ownerId === user.id && item.parentId === group.parentId && item.name === group.name)) {
      return NextResponse.json({ message: "该分组已存在" }, { status: 409 });
    }
    demoStore.groups.push(group);
    return NextResponse.json({ group });
  }
  try {
    if (group.parentId) {
      const parent = await query("select 1 from prototype_groups where id = $1 and owner_id = $2", [group.parentId, user.id]);
      if (!parent.rows[0]) return NextResponse.json({ message: "上级分组不存在" }, { status: 400 });
    }
    await query(
      `insert into prototype_groups (id, owner_id, parent_id, name, sort_order)
       values ($1, $2, $3, $4, $5)`,
      [group.id, user.id, group.parentId, group.name, group.sortOrder],
    );
    return NextResponse.json({ group });
  } catch (error) {
    const duplicate = typeof error === "object" && error && "code" in error && error.code === "23505";
    return NextResponse.json({ message: duplicate ? "该分组已存在" : "分组创建失败" }, { status: duplicate ? 409 : 400 });
  }
}
