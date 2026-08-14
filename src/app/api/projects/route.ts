import { after, NextResponse } from "next/server";
import path from "node:path";
import { nanoid } from "nanoid";
import { getCurrentUser } from "@/lib/auth";
import { captureDemoProjectPreview, captureProjectPreview } from "@/lib/capture-preview";
import { query, withTransaction } from "@/lib/db";
import { demoStore } from "@/lib/demo-store";
import { isDemoMode } from "@/lib/env";
import { removeStoredPrototype, writePrototypeBundle } from "@/lib/file-storage";
import { readPrototypeUpload } from "@/lib/prototype-upload";
import { rejectInvalidOrigin } from "@/lib/security";
import { assertUploadWithinBudget } from "@/lib/storage-budget";
import type { PrototypeProject } from "@/lib/types";

export const maxDuration = 60;

function displayName(name: FormDataEntryValue | null, fallback: string) {
  const input = typeof name === "string" ? name.trim() : "";
  return input.slice(0, 80) || fallback.slice(0, 80);
}

export async function POST(request: Request) {
  const originError = rejectInvalidOrigin(request);
  if (originError) return originError;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ message: "请先登录" }, { status: 401 });

  let form: FormData;
  try {
    form = await request.formData();
  } catch (error) {
    console.error("上传表单解析失败", error);
    return NextResponse.json(
      { message: "上传内容解析失败，请重新选择文件后再试" },
      { status: 400 },
    );
  }
  const groupId = typeof form.get("groupId") === "string" && form.get("groupId")
    ? String(form.get("groupId"))
    : null;

  let htmlPath: string | null = null;
  try {
    const upload = await readPrototypeUpload(form);

    if (groupId) {
      const ownsGroup = isDemoMode
        ? demoStore.groups.some((group) => group.id === groupId && group.ownerId === user.id)
        : Boolean(
            (await query("select 1 from prototype_groups where id = $1 and owner_id = $2", [groupId, user.id])).rows[0],
          );
      if (!ownsGroup) throw new Error("所选分组不存在");
    }

    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const publicCode = nanoid(8);
    const shareCode = nanoid(8);
    const name = displayName(form.get("name"), upload.suggestedName);
    if (isDemoMode) {
      await assertUploadWithinBudget(user.id, upload.totalSize);
      const root = path.posix.join("demo", user.id, `${id}-${nanoid(8)}`);
      htmlPath = path.posix.join(root, upload.entryPath);
      upload.assets.forEach((asset) => demoStore.htmlFiles.set(path.posix.join(root, asset.path), asset.content));
    } else {
      await withTransaction(async (client) => {
        await assertUploadWithinBudget(user.id, upload.totalSize, 0, client);
        htmlPath = await writePrototypeBundle(user.id, id, upload.assets, upload.entryPath);
        await client.query(
          `insert into projects
            (id, public_code, share_code, name, owner_id, department_id, group_id,
             html_path, file_size, source_kind, source_name)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
          [
            id,
            publicCode,
            shareCode,
            name,
            user.id,
            user.departmentId,
            groupId,
            htmlPath,
            upload.totalSize,
            upload.sourceKind,
            upload.sourceName,
          ],
        );
        await client.query(
          "insert into platform_events (event_type, project_id, user_id) values ('upload', $1, $2)",
          [id, user.id],
        );
      });
    }
    const project: PrototypeProject = {
      id,
      publicCode,
      shareCode,
      name,
      ownerId: user.id,
      ownerName: user.name,
      departmentId: user.departmentId,
      departmentName: user.departmentName,
      groupId,
      categoryId: null,
      categoryName: null,
      htmlPath: htmlPath!,
      sourceKind: upload.sourceKind,
      sourceName: upload.sourceName,
      previewPath: null,
      previewUrl: null,
      previewSize: 0,
      previewStatus: "pending",
      previewError: null,
      fileSize: upload.totalSize,
      isPublic: false,
      shareEnabled: false,
      shareExpiresAt: null,
      shareHasPassword: false,
      shareVersion: 1,
      visitCount: 0,
      createdAt: now,
      updatedAt: now,
    };

    if (isDemoMode) {
      demoStore.projects.unshift(project);
      after(() => captureDemoProjectPreview(id, publicCode, user.account, htmlPath!));
    } else {
      after(() => captureProjectPreview(id, htmlPath!, user.id));
    }
    return NextResponse.json({ project });
  } catch (error) {
    if (!isDemoMode && htmlPath) await removeStoredPrototype(htmlPath).catch(() => undefined);
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "原型创建失败" },
      { status: 400 },
    );
  }
}
