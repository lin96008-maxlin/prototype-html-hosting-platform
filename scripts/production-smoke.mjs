import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import JSZip from "jszip";
import pg from "pg";

const cwd = process.cwd();
const port = Number(process.env.SMOKE_PORT ?? 3200);
const baseUrl = `http://127.0.0.1:${port}/manage`;
const manageUrl = "https://prototype-demo.example.com/manage";
const demoUrl = manageUrl;
const databaseUrl = process.env.SMOKE_DATABASE_URL ?? "postgresql://postgres@127.0.0.1:55432/prototype_demo_validation";
const dataDir = process.env.SMOKE_DATA_DIR ?? path.join(os.tmpdir(), "prototype-demo-smoke");
const account = process.env.SMOKE_ADMIN_ACCOUNT ?? "validation_admin";
const password = process.env.SMOKE_ADMIN_PASSWORD ?? "Validation@2026";
const chromiumPath = process.env.SMOKE_CHROMIUM_PATH
  ?? [
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  ].find((candidate) => existsSync(candidate));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function cookiesFrom(response) {
  return response.headers.getSetCookie().map((item) => item.split(";", 1)[0]).join("; ");
}

async function expectResponse(response, expected, label) {
  if (response.status !== expected) {
    const body = await response.text();
    throw new Error(`${label}失败：HTTP ${response.status} ${body.slice(0, 500)}`);
  }
  return response;
}

async function waitForHealth(child) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`生产服务器提前退出：${child.exitCode}`);
    try {
      const response = await fetch(`${baseUrl}/api/health`, { cache: "no-store" });
      if (response.ok) return;
    } catch {
      // 服务尚未完成监听，继续等待。
    }
    await delay(500);
  }
  throw new Error("生产服务器健康检查超时");
}

async function waitForPreview(projectId, cookie) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const response = await fetch(`${baseUrl}/api/projects/${projectId}/preview`, {
      headers: { cookie },
      cache: "no-store",
    });
    await expectResponse(response, 200, "预览状态查询");
    const body = await response.json();
    if (body.preview.status === "ready") return body.preview;
    if (body.preview.status === "failed") {
      throw new Error(`预览图生成失败：${body.preview.error ?? "未知原因"}`);
    }
    await delay(500);
  }
  throw new Error("预览图生成超时");
}

async function stopServer(child) {
  if (child.exitCode !== null) return;
  child.kill("SIGTERM");
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (child.exitCode !== null) return;
    await delay(250);
  }
  child.kill("SIGKILL");
}

assert(existsSync(path.join(cwd, ".next", "BUILD_ID")), "缺少生产构建，请先执行 npm run build");
assert(chromiumPath, "未找到 Chromium、Edge 或 Chrome");
await mkdir(dataDir, { recursive: true });

const standaloneDir = path.join(cwd, ".next", "standalone");
const child = spawn(process.execPath, [path.join(standaloneDir, "server.js")], {
  cwd: standaloneDir,
  env: {
    ...process.env,
    NODE_ENV: "production",
    PORT: String(port),
    HOSTNAME: "127.0.0.1",
    DATABASE_URL: databaseUrl,
    DATA_DIR: dataDir,
    MANAGE_URL: manageUrl,
    DEMO_URL: demoUrl,
    AUTH_COOKIE_DOMAIN: ".example.com",
    SESSION_SIGNING_SECRET: "production-smoke-session-signing-secret-2026",
    SHARE_PASSWORD_ENCRYPTION_KEY: "production-smoke-share-password-key-2026",
    CHROMIUM_EXECUTABLE_PATH: chromiumPath,
    DEMO_MODE: "false",
  },
  stdio: "inherit",
});

const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
let project = null;
let sessionCookie = "";

try {
  await waitForHealth(child);

  const login = await expectResponse(await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: manageUrl },
    body: JSON.stringify({ account, password }),
  }), 200, "生产登录");
  sessionCookie = cookiesFrom(login);
  assert(sessionCookie.includes("prototype_session="), "登录响应缺少会话 Cookie");

  const fixture = await readFile(path.join(cwd, "tests", "fixtures", "订单协同工作台.html"));
  const uploadForm = new FormData();
  uploadForm.set("file", new Blob([fixture], { type: "text/html" }), "生产冒烟.html");
  const upload = await expectResponse(await fetch(`${baseUrl}/api/projects`, {
    method: "POST",
    headers: { cookie: sessionCookie, origin: manageUrl },
    body: uploadForm,
  }), 200, "生产上传");
  project = (await upload.json()).project;
  assert(project.name === "生产冒烟", "空名称未自动使用文件名");
  assert(existsSync(path.resolve(dataDir, project.htmlPath)), "上传后的 HTML 文件不存在");

  let preview = await waitForPreview(project.id, sessionCookie);
  const previewResponse = await expectResponse(await fetch(`${baseUrl}${preview.url}`, {
    headers: { cookie: sessionCookie },
  }), 200, "预览图片读取");
  assert(previewResponse.headers.get("content-type")?.startsWith("image/webp"), "预览图片不是 WebP");
  assert((await previewResponse.arrayBuffer()).byteLength > 1000, "预览图片内容为空");

  const ownerView = await expectResponse(await fetch(`${baseUrl}/project/${project.publicCode}/`, {
    headers: { cookie: sessionCookie },
  }), 200, "原型访问");
  assert((await ownerView.text()).includes("订单协同工作台"), "原型 HTML 内容不正确");

  const initialHtmlPath = project.htmlPath;
  const rarContent = await readFile(path.join(cwd, "tests", "fixtures", "rar-project.rar"));
  const rarForm = new FormData();
  rarForm.set("file", new Blob([rarContent], { type: "application/vnd.rar" }), "生产RAR项目.rar");
  const rarUpdate = await expectResponse(await fetch(`${baseUrl}/api/projects/${project.id}/file`, {
    method: "POST",
    headers: { cookie: sessionCookie, origin: manageUrl },
    body: rarForm,
  }), 200, "生产 RAR 更新");
  project = (await rarUpdate.json()).project;
  assert(project.fileSize === 238, "RAR 解压后容量统计不正确");
  assert(!existsSync(path.resolve(dataDir, initialHtmlPath)), "RAR 更新后旧 HTML 文件未删除");
  const rarAsset = await expectResponse(await fetch(`${baseUrl}/project/${project.publicCode}/assets/theme.css`, {
    headers: { cookie: sessionCookie },
  }), 200, "RAR 子资源访问");
  assert((await rarAsset.text()).includes("rgb(18, 52, 86)"), "RAR 子资源内容不正确");
  await waitForPreview(project.id, sessionCookie);

  const oldHtmlPath = project.htmlPath;
  const updatedHtml = "<!doctype html><html lang=\"zh-CN\"><head><meta charset=\"utf-8\"><title>生产更新验收</title><link rel=\"stylesheet\" href=\"assets/style.css\"></head><body><h1>生产更新验收</h1><script src=\"assets/app.js\"></script></body></html>";
  const updatedCss = "body{background:#f4f7fb;color:#102a56}h1{font-size:32px}";
  const updatedScript = "document.documentElement.dataset.bundleLoaded='true';";
  const zip = new JSZip();
  zip.file("生产冒烟项目/index.html", updatedHtml);
  zip.file("生产冒烟项目/assets/style.css", updatedCss);
  zip.file("生产冒烟项目/assets/app.js", updatedScript);
  const zipContent = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
  const updateForm = new FormData();
  updateForm.set("file", new Blob([zipContent], { type: "application/zip" }), "生产冒烟项目.zip");
  const update = await expectResponse(await fetch(`${baseUrl}/api/projects/${project.id}/file`, {
    method: "POST",
    headers: { cookie: sessionCookie, origin: manageUrl },
    body: updateForm,
  }), 200, "生产更新");
  const updatedProject = (await update.json()).project;
  assert(updatedProject.publicCode === project.publicCode, "更新后原型访问地址发生变化");
  assert(updatedProject.shareCode === project.shareCode, "更新后分享地址发生变化");
  assert(updatedProject.htmlPath !== oldHtmlPath, "更新后仍在使用旧 HTML 文件");
  assert(!existsSync(path.resolve(dataDir, oldHtmlPath)), "更新后旧 HTML 文件未删除");
  assert(updatedProject.fileSize === Buffer.byteLength(updatedHtml) + Buffer.byteLength(updatedCss) + Buffer.byteLength(updatedScript), "ZIP 解压后容量统计不正确");
  preview = await waitForPreview(project.id, sessionCookie);
  assert(preview.url, "更新后未生成预览图");

  const ownerAsset = await expectResponse(await fetch(`${baseUrl}/project/${project.publicCode}/assets/style.css`, {
    headers: { cookie: sessionCookie },
  }), 200, "原型子资源访问");
  assert(ownerAsset.headers.get("content-type")?.startsWith("text/css"), "CSS 子资源类型不正确");
  assert((await ownerAsset.text()) === updatedCss, "CSS 子资源内容不正确");

  const category = await pool.query("select id from business_categories where enabled = true order by sort_order limit 1");
  assert(category.rows[0]?.id, "缺少可用业务分类");
  await expectResponse(await fetch(`${baseUrl}/api/projects/${project.id}`, {
    method: "PATCH",
    headers: { cookie: sessionCookie, origin: manageUrl, "content-type": "application/json" },
    body: JSON.stringify({ isPublic: true, categoryId: category.rows[0].id }),
  }), 200, "公开设置");

  const anonymousPublic = await expectResponse(await fetch(`${baseUrl}/project/${project.publicCode}`, {
    redirect: "manual",
  }), 307, "公开原型登录校验");
  const publicLocation = anonymousPublic.headers.get("location") ?? "";
  assert(publicLocation.startsWith(`${manageUrl}/login?returnTo=`), "公开原型未跳转到管理端登录");
  assert(decodeURIComponent(publicLocation).includes(`${demoUrl}/project/${project.publicCode}`), "公开原型回跳地址域名错误");

  const shareExpiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const shareUpdate = await expectResponse(await fetch(`${baseUrl}/api/projects/${project.id}`, {
    method: "PATCH",
    headers: { cookie: sessionCookie, origin: manageUrl, "content-type": "application/json" },
    body: JSON.stringify({ shareEnabled: true, sharePassword: "SmokeShare@2026", shareExpiresAt }),
  }), 200, "分享设置");
  const sharedManagementProject = (await shareUpdate.json()).project;
  assert(sharedManagementProject.sharePassword === "SmokeShare@2026", "管理端未返回可回填的分享密码");
  assert(sharedManagementProject.shareExpiresAt === shareExpiresAt, "分享截止时间未正确保存");
  const passwordStorage = await pool.query(
    "select share_password_hash, share_password_encrypted from projects where id = $1",
    [project.id],
  );
  assert(passwordStorage.rows[0].share_password_hash !== "SmokeShare@2026", "数据库错误地明文保存了分享密码");
  assert(passwordStorage.rows[0].share_password_encrypted && !passwordStorage.rows[0].share_password_encrypted.includes("SmokeShare@2026"), "分享密码加密字段无效");
  const passwordPage = await expectResponse(await fetch(`${baseUrl}/share/${project.shareCode}`), 200, "匿名分享访问");
  assert((await passwordPage.text()).includes("访问密码"), "分享密码页未显示");

  const wrongPassword = new FormData();
  wrongPassword.set("password", "wrong");
  await expectResponse(await fetch(`${baseUrl}/share/${project.shareCode}`, {
    method: "POST",
    headers: { origin: demoUrl },
    body: wrongPassword,
    redirect: "manual",
  }), 401, "错误分享密码");

  const correctPassword = new FormData();
  correctPassword.set("password", "SmokeShare@2026");
  const shareGrant = await expectResponse(await fetch(`${baseUrl}/share/${project.shareCode}`, {
    method: "POST",
    headers: { origin: demoUrl },
    body: correctPassword,
    redirect: "manual",
  }), 303, "正确分享密码");
  assert(shareGrant.headers.get("location") === `${demoUrl}/share/${project.shareCode}/`, "分享成功跳转域名错误");
  const shareCookie = cookiesFrom(shareGrant);
  const sharedPrototype = await expectResponse(await fetch(`${baseUrl}/share/${project.shareCode}`, {
    headers: { cookie: shareCookie },
  }), 200, "分享授权访问");
  assert((await sharedPrototype.text()).includes("生产更新验收"), "分享访问未返回更新后的 HTML");
  const sharedAsset = await expectResponse(await fetch(`${baseUrl}/share/${project.shareCode}/assets/app.js`, {
    headers: { cookie: shareCookie },
  }), 200, "分享子资源访问");
  assert((await sharedAsset.text()) === updatedScript, "分享访问未返回 ZIP 内子资源");

  const stored = await pool.query("select html_path, preview_path from projects where id = $1", [project.id]);
  const finalHtmlPath = stored.rows[0].html_path;
  const finalPreviewPath = stored.rows[0].preview_path;
  await expectResponse(await fetch(`${baseUrl}/api/projects/${project.id}`, {
    method: "DELETE",
    headers: { cookie: sessionCookie, origin: manageUrl },
  }), 200, "测试原型删除");
  assert(!existsSync(path.resolve(dataDir, finalHtmlPath)), "删除后 HTML 文件仍存在");
  assert(!existsSync(path.resolve(dataDir, finalPreviewPath)), "删除后预览图片仍存在");
  const remaining = await pool.query("select count(*)::int as count from projects where id = $1", [project.id]);
  assert(remaining.rows[0].count === 0, "删除后数据库仍保留原型");
  project = null;

  console.log("生产冒烟测试通过：真实数据库、单 HTML/ZIP/RAR 上传、截图、替换清理、子资源、公开、分享密码、删除均正常");
} finally {
  if (project?.id && sessionCookie && child.exitCode === null) {
    await fetch(`${baseUrl}/api/projects/${project.id}`, {
      method: "DELETE",
      headers: { cookie: sessionCookie, origin: manageUrl },
    }).catch(() => undefined);
  }
  if (project?.id) {
    await pool.query("delete from projects where id = $1", [project.id]).catch(() => undefined);
  }
  await pool.end().catch(() => undefined);
  await stopServer(child);
}
