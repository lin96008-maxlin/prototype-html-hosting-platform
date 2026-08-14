import { after, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { captureDemoProjectPreview, captureProjectPreview } from "@/lib/capture-preview";
import { getProjectById } from "@/lib/data";
import { query } from "@/lib/db";
import { demoStore } from "@/lib/demo-store";
import { isDemoMode } from "@/lib/env";
import { canManageProject, canViewProject } from "@/lib/project-permission";
import { rejectInvalidOrigin } from "@/lib/security";

export const maxDuration = 60;

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ message: "请先登录" }, { status: 401 });
  const { id } = await context.params;
  const project = await getProjectById(id);
  if (!project || !(await canViewProject(user, project))) {
    return NextResponse.json({ message: "原型不存在或无权查看" }, { status: 404 });
  }
  return NextResponse.json({
    preview: {
      status: project.previewStatus,
      url: project.previewUrl,
      error: project.previewError,
      size: project.previewSize,
      updatedAt: project.updatedAt,
    },
  });
}

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
  if (isDemoMode) {
    const storedProject = demoStore.projects.find((item) => item.id === project.id)!;
    demoStore.previewFiles.delete(project.id);
    storedProject.previewUrl = null;
    storedProject.previewSize = 0;
    storedProject.previewStatus = "pending";
    storedProject.previewError = null;
    after(() => captureDemoProjectPreview(project.id, project.publicCode, user.account, project.htmlPath));
    return NextResponse.json({ ok: true });
  }

  await query(
    "update projects set preview_status = 'pending', preview_error = null where id = $1",
    [project.id],
  );
  after(() => captureProjectPreview(project.id, project.htmlPath, project.ownerId));
  return NextResponse.json({ ok: true });
}
