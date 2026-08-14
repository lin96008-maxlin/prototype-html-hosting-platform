import { hash } from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { getProjectById } from "@/lib/data";
import { query } from "@/lib/db";
import { demoStore } from "@/lib/demo-store";
import { isDemoMode } from "@/lib/env";
import { removeStoredFile, removeStoredPrototype } from "@/lib/file-storage";
import { canManageProject } from "@/lib/project-permission";
import { rejectInvalidOrigin } from "@/lib/security";
import { isPrototypeEntryName } from "@/lib/prototype-entry";
import { readRequestJson } from "@/lib/request-json";
import { encryptSharePassword } from "@/lib/share-password-crypto";

const schema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  groupId: z.string().min(1).nullable().optional(),
  isPublic: z.boolean().optional(),
  categoryId: z.string().min(1).nullable().optional(),
  shareEnabled: z.boolean().optional(),
  shareExpiresAt: z.string().datetime().nullable().optional(),
  sharePassword: z.string().max(64).optional(),
});

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const originError = rejectInvalidOrigin(request);
  if (originError) return originError;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ message: "请先登录" }, { status: 401 });
  const { id } = await context.params;
  const project = await getProjectById(id);
  if (!project || !(await canManageProject(user, project))) {
    return NextResponse.json({ message: "原型不存在或无权操作" }, { status: 404 });
  }
  const parsed = schema.safeParse(await readRequestJson(request));
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message }, { status: 400 });
  }
  const input = parsed.data;

  if (input.groupId) {
    const validGroup = isDemoMode
      ? demoStore.groups.some((group) => group.id === input.groupId && group.ownerId === project.ownerId)
      : Boolean(
          (await query("select 1 from prototype_groups where id = $1 and owner_id = $2", [input.groupId, project.ownerId])).rows[0],
        );
    if (!validGroup) {
      return NextResponse.json({ message: "所选分组不属于原型负责人" }, { status: 400 });
    }
  }

  let categoryName = project.categoryName;
  if (input.isPublic === true) {
    const categoryId = input.categoryId ?? project.categoryId;
    if (isDemoMode) {
      const category = demoStore.categories.find((item) => item.id === categoryId && item.enabled);
      if (!category) {
        return NextResponse.json({ message: "公开原型前必须选择业务分类" }, { status: 400 });
      }
      categoryName = category.name;
    } else {
      const category = await query<{ name: string }>(
        "select name from business_categories where id = $1 and enabled = true",
        [categoryId],
      );
      if (!category.rows[0]) {
        return NextResponse.json({ message: "公开原型前必须选择业务分类" }, { status: 400 });
      }
      categoryName = category.rows[0].name;
    }
  }

  if (input.shareExpiresAt && new Date(input.shareExpiresAt).getTime() <= Date.now()) {
    return NextResponse.json({ message: "分享截止时间必须晚于当前时间" }, { status: 400 });
  }

  if (isDemoMode) {
    const storedProject = demoStore.projects.find((item) => item.id === project.id)!;
    if (input.name !== undefined) storedProject.name = input.name;
    if (input.groupId !== undefined) storedProject.groupId = input.groupId;
    if (input.categoryId !== undefined) storedProject.categoryId = input.categoryId;
    if (input.isPublic !== undefined) storedProject.isPublic = input.isPublic;
    if (input.shareEnabled !== undefined) storedProject.shareEnabled = input.shareEnabled;
    if (input.shareExpiresAt !== undefined) storedProject.shareExpiresAt = input.shareExpiresAt;
    if (input.sharePassword !== undefined) {
      if (input.sharePassword) demoStore.sharePasswords.set(project.id, input.sharePassword);
      else demoStore.sharePasswords.delete(project.id);
      storedProject.shareHasPassword = Boolean(input.sharePassword);
    }
    if (
      input.shareEnabled !== undefined
      || input.shareExpiresAt !== undefined
      || input.sharePassword !== undefined
    ) {
      storedProject.shareVersion = (storedProject.shareVersion ?? 1) + 1;
    }
    storedProject.categoryName = input.categoryId === null ? null : categoryName;
    storedProject.updatedAt = new Date().toISOString();
    return NextResponse.json({
      project: {
        ...storedProject,
        sharePassword: demoStore.sharePasswords.get(storedProject.id) ?? null,
      },
    });
  }

  const values: unknown[] = [];
  const assignments = ["updated_at = now()"];
  const add = (column: string, value: unknown) => {
    values.push(value);
    assignments.push(`${column} = $${values.length}`);
  };
  if (input.name !== undefined) add("name", input.name);
  if (input.groupId !== undefined) add("group_id", input.groupId);
  if (input.categoryId !== undefined) add("category_id", input.categoryId);
  if (input.isPublic !== undefined) add("is_public", input.isPublic);
  if (input.shareEnabled !== undefined) add("share_enabled", input.shareEnabled);
  if (input.shareExpiresAt !== undefined) add("share_expires_at", input.shareExpiresAt);
  if (input.sharePassword !== undefined) {
    add("share_password_hash", input.sharePassword ? await hash(input.sharePassword, 10) : null);
    add("share_password_encrypted", input.sharePassword ? encryptSharePassword(input.sharePassword) : null);
  }
  if (
    input.shareEnabled !== undefined
    || input.shareExpiresAt !== undefined
    || input.sharePassword !== undefined
  ) {
    assignments.push("share_version = share_version + 1");
  }
  values.push(project.id);
  await query(`update projects set ${assignments.join(", ")} where id = $${values.length}`, values);
  return NextResponse.json({ project: await getProjectById(project.id) });
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const originError = rejectInvalidOrigin(request);
  if (originError) return originError;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ message: "请先登录" }, { status: 401 });
  const { id } = await context.params;
  const project = await getProjectById(id);
  if (!project || !(await canManageProject(user, project))) {
    return NextResponse.json({ message: "原型不存在或无权操作" }, { status: 404 });
  }

  if (isDemoMode) {
    const index = demoStore.projects.findIndex((item) => item.id === project.id);
    if (index >= 0) demoStore.projects.splice(index, 1);
    const bundled = isPrototypeEntryName(project.htmlPath);
    const root = bundled ? project.htmlPath.replace(/\/[^/]+$/, "") : project.htmlPath;
    [...demoStore.htmlFiles.keys()].forEach((key) => {
      if (key === project.htmlPath || (bundled && key.startsWith(`${root}/`))) demoStore.htmlFiles.delete(key);
    });
    demoStore.sharePasswords.delete(project.id);
    demoStore.previewFiles.delete(project.id);
    return NextResponse.json({ ok: true });
  }

  const deleted = await query<{ html_path: string; preview_path: string | null }>(
    "delete from projects where id = $1 returning html_path, preview_path",
    [project.id],
  );
  const stored = deleted.rows[0];
  await Promise.all([
    removeStoredPrototype(stored?.html_path ?? project.htmlPath),
    removeStoredFile(stored?.preview_path ?? project.previewPath),
  ]).catch((error) => console.error("原型文件清理失败", error));
  return NextResponse.json({ ok: true });
}
