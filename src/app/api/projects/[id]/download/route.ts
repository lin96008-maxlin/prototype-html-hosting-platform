import path from "node:path";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getProjectById } from "@/lib/data";
import { demoStore } from "@/lib/demo-store";
import { isDemoMode } from "@/lib/env";
import { readStoredFile, readStoredPrototypeBundle } from "@/lib/file-storage";
import { getProjectHtml } from "@/lib/project-content";
import {
  attachmentDisposition,
  createPrototypeZip,
  projectDownloadName,
} from "@/lib/project-download";
import { canDownloadProject } from "@/lib/project-permission";
import type { PrototypeAsset } from "@/lib/prototype-upload";
import type { PrototypeProject } from "@/lib/types";

export const maxDuration = 60;

function bytes(content: string | Uint8Array) {
  return typeof content === "string" ? new TextEncoder().encode(content) : content;
}

async function readDemoHtml(project: PrototypeProject) {
  const stored = demoStore.htmlFiles.get(project.htmlPath);
  return stored ? bytes(stored) : new TextEncoder().encode(await getProjectHtml(project));
}

async function readDemoBundle(project: PrototypeProject): Promise<PrototypeAsset[]> {
  const root = path.posix.dirname(project.htmlPath);
  const prefix = `${root}/`;
  const assets = [...demoStore.htmlFiles.entries()]
    .filter(([storedPath]) => storedPath.startsWith(prefix))
    .map(([storedPath, content]) => ({ path: storedPath.slice(prefix.length), content: bytes(content) }));
  return assets.length ? assets : [{
    path: path.posix.basename(project.htmlPath) || "index.html",
    content: await readDemoHtml(project),
  }];
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ message: "请先登录" }, { status: 401 });

  const { id } = await context.params;
  const project = await getProjectById(id);
  if (!project || !(await canDownloadProject(user, project))) {
    return NextResponse.json({ message: "原型不存在或无权下载" }, { status: 404 });
  }

  try {
    const html = project.sourceKind === "html";
    const content = html
      ? (isDemoMode ? await readDemoHtml(project) : new Uint8Array(await readStoredFile(project.htmlPath)))
      : await createPrototypeZip(
          isDemoMode ? await readDemoBundle(project) : await readStoredPrototypeBundle(project.htmlPath),
        );
    const fileName = projectDownloadName(project);
    return new NextResponse(Buffer.from(content), {
      headers: {
        "Content-Type": html ? "text/html; charset=utf-8" : "application/zip",
        "Content-Disposition": attachmentDisposition(fileName),
        "Content-Length": String(content.byteLength),
        "Cache-Control": "private, no-store, max-age=0",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("原型下载生成失败", error);
    return NextResponse.json({ message: "下载文件生成失败，请稍后重试" }, { status: 500 });
  }
}
