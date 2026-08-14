import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { query, withTransaction } from "@/lib/db";
import { demoStore } from "@/lib/demo-store";
import { isDemoMode } from "@/lib/env";
import { rejectInvalidOrigin } from "@/lib/security";
import { readRequestJson } from "@/lib/request-json";

const schema = z.object({
  name: z.string().trim().min(1).max(30).optional(),
  enabled: z.boolean().optional(),
  move: z.enum(["up", "down"]).optional(),
});

async function authorize(request: Request) {
  const originError = rejectInvalidOrigin(request);
  if (originError) return originError;
  const user = await getCurrentUser();
  if (!user || user.role !== "super_admin") {
    return NextResponse.json({ message: "无权操作" }, { status: 403 });
  }
  return null;
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const denied = await authorize(request);
  if (denied) return denied;
  const parsed = schema.safeParse(await readRequestJson(request));
  if (!parsed.success) return NextResponse.json({ message: "分类信息无效" }, { status: 400 });
  const { id } = await context.params;
  try {
    if (parsed.data.move) {
      if (isDemoMode) {
        const ordered = [...demoStore.categories].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
        const index = ordered.findIndex((item) => item.id === id);
        if (index < 0) return NextResponse.json({ message: "分类不存在" }, { status: 404 });
        const targetIndex = parsed.data.move === "up" ? index - 1 : index + 1;
        if (targetIndex >= 0 && targetIndex < ordered.length) {
          [ordered[index], ordered[targetIndex]] = [ordered[targetIndex], ordered[index]];
          ordered.forEach((item, order) => { item.sortOrder = (order + 1) * 10; });
        }
      } else {
        const found = await withTransaction(async (client) => {
          const result = await client.query<{ id: string }>(
            "select id from business_categories order by sort_order, name for update",
          );
          const orderedIds = result.rows.map((row) => String(row.id));
          const index = orderedIds.indexOf(id);
          if (index < 0) return false;
          const targetIndex = parsed.data.move === "up" ? index - 1 : index + 1;
          if (targetIndex >= 0 && targetIndex < orderedIds.length) {
            [orderedIds[index], orderedIds[targetIndex]] = [orderedIds[targetIndex], orderedIds[index]];
            for (const [order, categoryId] of orderedIds.entries()) {
              await client.query(
                "update business_categories set sort_order = $1, updated_at = now() where id = $2",
                [(order + 1) * 10, categoryId],
              );
            }
          }
          return true;
        });
        if (!found) return NextResponse.json({ message: "分类不存在" }, { status: 404 });
      }
      return NextResponse.json({ ok: true });
    }
    if (isDemoMode) {
      const category = demoStore.categories.find((item) => item.id === id);
      if (!category) return NextResponse.json({ message: "分类不存在" }, { status: 404 });
      Object.assign(category, parsed.data);
    } else {
      const values: unknown[] = [];
      const assignments = ["updated_at = now()"];
      if (parsed.data.name !== undefined) {
        values.push(parsed.data.name);
        assignments.push(`name = $${values.length}`);
      }
      if (parsed.data.enabled !== undefined) {
        values.push(parsed.data.enabled);
        assignments.push(`enabled = $${values.length}`);
      }
      values.push(id);
      const result = await query(
        `update business_categories set ${assignments.join(", ")} where id = $${values.length} returning id`,
        values,
      );
      if (!result.rows[0]) return NextResponse.json({ message: "分类不存在" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    const duplicate = typeof error === "object" && error && "code" in error && error.code === "23505";
    return NextResponse.json({ message: duplicate ? "分类已存在" : "分类保存失败" }, { status: duplicate ? 409 : 400 });
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const denied = await authorize(request);
  if (denied) return denied;
  const { id } = await context.params;
  const inUse = isDemoMode
    ? demoStore.projects.some((project) => project.categoryId === id)
    : Boolean((await query("select 1 from projects where category_id = $1 limit 1", [id])).rows[0]);
  if (inUse) {
    return NextResponse.json({ message: "该分类已被原型使用，可停用但不能删除" }, { status: 409 });
  }
  if (isDemoMode) {
    const index = demoStore.categories.findIndex((item) => item.id === id);
    if (index >= 0) demoStore.categories.splice(index, 1);
  } else {
    await query("delete from business_categories where id = $1", [id]);
  }
  return NextResponse.json({ ok: true });
}
