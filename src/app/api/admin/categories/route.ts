import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { demoStore } from "@/lib/demo-store";
import { isDemoMode } from "@/lib/env";
import { rejectInvalidOrigin } from "@/lib/security";
import { readRequestJson } from "@/lib/request-json";

const schema = z.object({ name: z.string().trim().min(1).max(30) });

export async function POST(request: Request) {
  const originError = rejectInvalidOrigin(request);
  if (originError) return originError;
  const user = await getCurrentUser();
  if (!user || user.role !== "super_admin") return NextResponse.json({ message: "无权操作" }, { status: 403 });
  const parsed = schema.safeParse(await readRequestJson(request));
  if (!parsed.success) return NextResponse.json({ message: "请输入分类名称" }, { status: 400 });
  const category = { id: crypto.randomUUID(), name: parsed.data.name, sortOrder: 0, enabled: true };
  try {
    if (isDemoMode) {
      if (demoStore.categories.some((item) => item.name === category.name)) throw new Error("DUPLICATE");
      category.sortOrder = Math.max(0, ...demoStore.categories.map((item) => item.sortOrder)) + 10;
      demoStore.categories.push(category);
    } else {
      const created = await query<{ sort_order: number }>(
        `insert into business_categories (id, name, sort_order)
         select $1, $2, coalesce(max(sort_order), 0) + 10 from business_categories
         returning sort_order`,
        [category.id, category.name],
      );
      category.sortOrder = Number(created.rows[0].sort_order);
    }
    return NextResponse.json({ category });
  } catch (error) {
    const duplicate = error instanceof Error && error.message === "DUPLICATE" ||
      (typeof error === "object" && error && "code" in error && error.code === "23505");
    return NextResponse.json({ message: duplicate ? "分类已存在" : "分类创建失败" }, { status: duplicate ? 409 : 400 });
  }
}
