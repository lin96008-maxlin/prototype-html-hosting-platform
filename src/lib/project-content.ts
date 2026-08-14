import { query } from "@/lib/db";
import { demoStore } from "@/lib/demo-store";
import { isDemoMode } from "@/lib/env";
import path from "node:path";
import { readPrototypeAsset, readStoredFile } from "@/lib/file-storage";
import type { PrototypeProject } from "@/lib/types";

function demoPrototype(project: PrototypeProject) {
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${project.name}</title><style>*{box-sizing:border-box}body{margin:0;font:14px "Microsoft YaHei",sans-serif;color:#223355;background:#f5f7fa}.top{height:60px;display:flex;align-items:center;padding:0 28px;color:#fff;background:#3388ff;font-size:18px}.layout{display:grid;grid-template-columns:210px 1fr;min-height:calc(100vh - 60px)}aside{padding:24px 16px;background:#fff;border-right:1px solid #e9ecf2}.nav{padding:11px 14px;margin-bottom:8px;border-radius:4px}.nav.on{color:#3388ff;background:#f0f9ff}main{padding:24px}.title{font-size:22px;font-weight:600;margin-bottom:20px}.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:16px}.stat,.panel{padding:20px;background:#fff;border:1px solid #e9ecf2;border-radius:6px}.n{font-size:28px;color:#081126;margin-top:12px}.panel{margin-top:16px;height:340px}.line{height:32px;margin:12px 0;background:linear-gradient(90deg,#d6edff 68%,#f5f7fa 68%);border-radius:3px}</style></head>
<body><div class="top">${project.name}</div><div class="layout"><aside><div class="nav on">工作台</div><div class="nav">业务管理</div><div class="nav">数据分析</div><div class="nav">系统设置</div></aside><main><div class="title">运行概览</div><div class="stats"><div class="stat">今日受理<div class="n">1,286</div></div><div class="stat">按时办结率<div class="n">96.8%</div></div><div class="stat">协同部门<div class="n">32</div></div><div class="stat">待办任务<div class="n">18</div></div></div><div class="panel"><b>业务趋势</b><div class="line"></div><div class="line" style="width:82%"></div><div class="line" style="width:91%"></div><div class="line" style="width:74%"></div></div></main></div></body></html>`;
}

export async function getProjectHtml(project: PrototypeProject) {
  if (isDemoMode) {
    const content = demoStore.htmlFiles.get(project.htmlPath);
    if (typeof content === "string") return content;
    if (content) return new TextDecoder().decode(content);
    return demoPrototype(project);
  }
  return (await readStoredFile(project.htmlPath)).toString("utf8");
}

export async function getProjectAsset(project: PrototypeProject, assetPath: string) {
  if (isDemoMode) {
    const storedPath = path.posix.join(path.posix.dirname(project.htmlPath), assetPath);
    const content = demoStore.htmlFiles.get(storedPath);
    if (typeof content === "string") return new TextEncoder().encode(content);
    if (content) return content;
    throw new Error("资源不存在");
  }
  return readPrototypeAsset(project.htmlPath, assetPath);
}

export async function recordProjectVisit(
  project: PrototypeProject,
  userId: string | null,
  visitorKey: string | null,
  accessType: "public" | "share" | "owner" | "admin",
) {
  if (isDemoMode) {
    const storedProject = demoStore.projects.find((item) => item.id === project.id);
    if (storedProject) storedProject.visitCount += 1;
    return;
  }
  await query(
    "insert into project_visits (project_id, user_id, visitor_key, access_type) values ($1, $2, $3, $4)",
    [project.id, userId, visitorKey, accessType],
  );
}
