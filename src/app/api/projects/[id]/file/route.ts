import { after, NextResponse } from "next/server";
import path from "node:path";
import { getCurrentUser } from "@/lib/auth";
import { captureDemoProjectPreview, captureProjectPreview } from "@/lib/capture-preview";
import { getProjectById } from "@/lib/data";
import { withTransaction } from "@/lib/db";
import { demoStore } from "@/lib/demo-store";
import { isDemoMode } from "@/lib/env";
import { removeStoredFile, removeStoredPrototype, writePrototypeBundle } from "@/lib/file-storage";
import { readPrototypeUpload } from "@/lib/prototype-upload";
import { isPrototypeEntryName } from "@/lib/prototype-entry";
import { canManageProject } from "@/lib/project-permission";
import { rejectInvalidOrigin } from "@/lib/security";
import { assertUploadWithinBudget } from "@/lib/storage-budget";

export const maxDuration = 60;

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const originError = rejectInvalidOrigin(request);
  if (originError) return originError;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ message: "请先登录" }, { status: 401 });
  const { id } = await context.params;
  const project = await getProjectById(id);
  if (!project || !(await canManageProject(user, project))) {
    return NextResponse.json({ message: "原型不存在或无权操作" }, { status: 404 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch (error) {
    console.error("更新原型表单解析失败", error);
    return NextResponse.json(
      { message: "上传内容解析失败，请重新选择文件后再试" },
      { status: 400 },
    );
  }
  let newPath: string | null = null;
  try {
    const upload = await readPrototypeUpload(form);
    const nameInput = form.get("name");
    const requestedName = typeof nameInput === "string" && nameInput.trim()
      ? nameInput.trim().slice(0, 80)
      : null;
    let name = requestedName ?? project.name;
    if (isDemoMode) {
      const storedProject = demoStore.projects.find((item) => item.id === project.id)!;
      await assertUploadWithinBudget(
        project.ownerId,
        upload.totalSize,
        project.fileSize + project.previewSize,
      );
      const root = path.posix.join("demo", project.ownerId, `${project.id}-${Date.now()}`);
      newPath = path.posix.join(root, upload.entryPath);
      upload.assets.forEach((asset) => demoStore.htmlFiles.set(path.posix.join(root, asset.path), asset.content));
      const bundled = isPrototypeEntryName(project.htmlPath);
      const oldRoot = bundled ? path.posix.dirname(project.htmlPath) : project.htmlPath;
      [...demoStore.htmlFiles.keys()].forEach((key) => {
        if (key === project.htmlPath || (bundled && key.startsWith(`${oldRoot}/`))) demoStore.htmlFiles.delete(key);
      });
      storedProject.htmlPath = newPath;
      storedProject.fileSize = upload.totalSize;
      storedProject.sourceKind = upload.sourceKind;
      storedProject.sourceName = upload.sourceName;
      storedProject.name = name;
      demoStore.previewFiles.delete(project.id);
      storedProject.previewUrl = null;
      storedProject.previewSize = 0;
      storedProject.previewStatus = "pending";
      storedProject.previewError = null;
      storedProject.updatedAt = new Date().toISOString();
      after(() => captureDemoProjectPreview(project.id, storedProject.publicCode, user.account, newPath!));
      return NextResponse.json({
        project: {
          ...storedProject,
          sharePassword: demoStore.sharePasswords.get(storedProject.id) ?? null,
        },
      });
    }

    let previousHtmlPath = project.htmlPath;
    let previousPreviewPath = project.previewPath;
    await withTransaction(async (client) => {
      const current = await client.query<{
        html_path: string;
        preview_path: string | null;
        file_size: string;
        preview_size: string;
        name: string;
      }>(
        `select html_path, preview_path, file_size, preview_size, name
           from projects where id = $1 for update`,
        [project.id],
      );
      if (!current.rows[0]) throw new Error("PROJECT_NOT_FOUND");
      previousHtmlPath = current.rows[0].html_path;
      previousPreviewPath = current.rows[0].preview_path;
      name = requestedName ?? current.rows[0].name;
      await assertUploadWithinBudget(
        project.ownerId,
        upload.totalSize,
        Number(current.rows[0].file_size) + Number(current.rows[0].preview_size),
        client,
      );
      newPath = await writePrototypeBundle(project.ownerId, project.id, upload.assets, upload.entryPath);
      await client.query(
        `update projects set html_path = $1, file_size = $2, name = $3,
           source_kind = $4, source_name = $5,
           preview_path = null, preview_size = 0, preview_status = 'pending',
           preview_error = null, updated_at = now()
          where id = $6`,
        [newPath, upload.totalSize, name, upload.sourceKind, upload.sourceName, project.id],
      );
      await client.query(
        "insert into platform_events (event_type, project_id, user_id) values ('update', $1, $2)",
        [project.id, user.id],
      );
    });
    await Promise.all([
      removeStoredPrototype(previousHtmlPath),
      removeStoredFile(previousPreviewPath),
    ]).catch((error) => console.error("旧原型文件清理失败", error));
    after(() => captureProjectPreview(project.id, newPath!, project.ownerId));
    return NextResponse.json({ project: await getProjectById(project.id) });
  } catch (error) {
    if (!isDemoMode && newPath) await removeStoredPrototype(newPath).catch(() => undefined);
    if (error instanceof Error && error.message === "PROJECT_NOT_FOUND") {
      return NextResponse.json({ message: "原型不存在或已被删除" }, { status: 404 });
    }
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "原型更新失败" },
      { status: 400 },
    );
  }
}
