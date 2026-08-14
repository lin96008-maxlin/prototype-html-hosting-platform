import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import path from "node:path";
import puppeteer from "puppeteer-core";
import { DEMO_SESSION_COOKIE } from "@/lib/auth";
import { urlUnderBase, withBasePath } from "@/lib/app-path";
import { query, withTransaction } from "@/lib/db";
import { demoStore } from "@/lib/demo-store";
import { env, isDemoMode } from "@/lib/env";
import { removeStoredFile, storedFileAbsolutePath, writePreviewFile } from "@/lib/file-storage";
import { isPrototypeEntryName } from "@/lib/prototype-entry";
import { assetContentType } from "@/lib/viewer-response";

let captureQueue: Promise<void> = Promise.resolve();

async function startPreviewServer(htmlPath: string) {
  const entryFile = storedFileAbsolutePath(htmlPath);
  const root = path.dirname(entryFile);
  const entryName = path.basename(entryFile);
  const isBundle = isPrototypeEntryName(entryName);
  const server: Server = createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url ?? "/", "http://127.0.0.1").pathname);
      const relativePath = pathname === "/" ? entryName : pathname.replace(/^\/+/, "");
      if (!isBundle && relativePath !== entryName) {
        response.writeHead(404).end();
        return;
      }
      const target = path.resolve(root, relativePath);
      if (target !== root && !target.startsWith(`${root}${path.sep}`)) {
        response.writeHead(403).end();
        return;
      }
      const content = await readFile(target);
      response.writeHead(200, {
        "cache-control": "no-store",
        "content-type": assetContentType(target),
        "x-content-type-options": "nosniff",
      });
      response.end(content);
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    server.close();
    throw new Error("预览截图临时服务启动失败");
  }
  return {
    server,
    url: `http://127.0.0.1:${address.port}/${encodeURIComponent(entryName)}`,
  };
}

async function closePreviewServer(server: Server | null) {
  if (!server) return;
  await new Promise<void>((resolve) => server.close(() => resolve()));
}

async function waitForPrototypeReady(page: Awaited<ReturnType<Awaited<ReturnType<typeof puppeteer.launch>>["newPage"]>>) {
  if (page.url().includes("/resources/chrome/")) {
    throw new Error("Axure 预览错误进入浏览器扩展提示页");
  }
  const isAxurePlayer = await page.$('script[src*="resources/scripts/player/axplayer.js"]');
  if (!isAxurePlayer) return;
  await page.waitForFunction(() => {
    const frame = document.querySelector<HTMLIFrameElement>("#mainFrame");
    if (!frame?.contentDocument?.body) return false;
    const location = frame.contentWindow?.location.href ?? "";
    return location !== "about:blank" && !location.includes("/resources/chrome/")
      && (frame.contentDocument.body.children.length > 0 || frame.contentDocument.body.textContent?.trim());
  }, { timeout: 15_000 });
}

function resolveChromiumExecutable() {
  const candidates = [
    env.chromiumExecutablePath,
    process.platform === "win32"
      ? "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"
      : "/usr/bin/chromium",
    process.platform === "win32"
      ? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
      : "/usr/bin/chromium-browser",
  ].filter((item): item is string => Boolean(item));
  return candidates.find((item) => existsSync(item));
}

async function performCapture(projectId: string, htmlPath: string, ownerId: string) {
  const pending = await query<{ exists: boolean }>(
    "select exists(select 1 from projects where id = $1 and html_path = $2) as exists",
    [projectId, htmlPath],
  );
  if (!pending.rows[0]?.exists) return;

  const executablePath = resolveChromiumExecutable();
  if (!executablePath) throw new Error("未找到 Chromium/Chrome 可执行文件");

  let browser: Awaited<ReturnType<typeof puppeteer.launch>> | null = null;
  let previewServer: Server | null = null;
  let previewPath: string | null = null;
  let committed = false;
  try {
    const served = await startPreviewServer(htmlPath);
    previewServer = served.server;
    browser = await puppeteer.launch({
      executablePath,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
      defaultViewport: { width: 1440, height: 900, deviceScaleFactor: 1 },
      headless: true,
    });
    const page = await browser.newPage();
    await page.setRequestInterception(true);
    const previewOrigin = new URL(served.url).origin;
    page.on("request", (request) => {
      const url = request.url();
      const matchesPreviewOrigin = url.startsWith("http:") && new URL(url).origin === previewOrigin;
      if (matchesPreviewOrigin || url.startsWith("data:") || url.startsWith("blob:") || url === "about:blank") {
        void request.continue();
      } else {
        void request.abort();
      }
    });
    await page.goto(served.url, {
      waitUntil: "networkidle0",
      timeout: 20_000,
    });
    await waitForPrototypeReady(page);
    const image = await page.screenshot({ type: "webp", quality: 68, fullPage: false });
    previewPath = await writePreviewFile(ownerId, projectId, image);
    const result = await withTransaction(async (client) => {
      const current = await client.query<{ preview_path: string | null }>(
        "select preview_path from projects where id = $1 and html_path = $2 for update",
        [projectId, htmlPath],
      );
      if (!current.rows[0]) return { committed: false, previousPreviewPath: null };
      await client.query(
        `update projects set preview_path = $1, preview_size = $2,
                preview_status = 'ready', preview_error = null
          where id = $3`,
        [previewPath, image.byteLength, projectId],
      );
      return { committed: true, previousPreviewPath: current.rows[0].preview_path };
    });
    committed = result.committed;
    if (!committed) {
      await removeStoredFile(previewPath);
      previewPath = null;
      return;
    }
    if (result.previousPreviewPath && result.previousPreviewPath !== previewPath) {
      await removeStoredFile(result.previousPreviewPath).catch((error) => {
        console.error("旧预览图清理失败", error);
      });
    }
  } catch (error) {
    if (previewPath && !committed) await removeStoredFile(previewPath).catch(() => undefined);
    const current = await query<{ exists: boolean }>(
      "select exists(select 1 from projects where id = $1 and html_path = $2) as exists",
      [projectId, htmlPath],
    ).catch(() => null);
    if (current && !current.rows[0]?.exists) return;
    const message = error instanceof Error ? error.message.slice(0, 500) : "未知错误";
    await query(
      "update projects set preview_status = 'failed', preview_error = $1 where id = $2 and html_path = $3",
      [message, projectId, htmlPath],
    ).catch(() => undefined);
    throw error;
  } finally {
    await browser?.close().catch(() => undefined);
    await closePreviewServer(previewServer).catch(() => undefined);
  }
}

async function performDemoCapture(
  projectId: string,
  publicCode: string,
  account: string,
  expectedHtmlPath: string,
) {
  if (!isDemoMode) return;
  if (!demoStore.projects.some((item) => item.id === projectId && item.htmlPath === expectedHtmlPath)) return;
  const executablePath = resolveChromiumExecutable();
  if (!executablePath) throw new Error("未找到 Chromium/Chrome 可执行文件");

  const targetUrl = new URL(urlUnderBase(env.demoUrl, `/project/${publicCode}/`));
  let browser: Awaited<ReturnType<typeof puppeteer.launch>> | null = null;
  try {
    browser = await puppeteer.launch({
      executablePath,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
      defaultViewport: { width: 1440, height: 900, deviceScaleFactor: 1 },
      headless: true,
    });
    const page = await browser.newPage();
    await page.setExtraHTTPHeaders({ "x-prototype-preview-capture": "1" });
    await page.setCookie({
      name: DEMO_SESSION_COOKIE,
      value: account,
      url: `${targetUrl.origin}/`,
      httpOnly: true,
      sameSite: "Lax",
    });
    await page.setRequestInterception(true);
    page.on("request", (request) => {
      const url = request.url();
      if (
        url.startsWith(targetUrl.origin)
        || url.startsWith("data:")
        || url.startsWith("blob:")
        || url === "about:blank"
      ) {
        void request.continue();
      } else {
        void request.abort();
      }
    });
    await page.goto(targetUrl.href, { waitUntil: "networkidle0", timeout: 20_000 });
    const image = await page.screenshot({ type: "webp", quality: 68, fullPage: false });
    const project = demoStore.projects.find((item) => item.id === projectId);
    if (!project || project.htmlPath !== expectedHtmlPath) return;
    demoStore.previewFiles.set(projectId, image);
    project.previewUrl = withBasePath(`/api/mock-preview/${projectId}?v=${Date.now()}`);
    project.previewSize = image.byteLength;
    project.previewStatus = "ready";
    project.previewError = null;
  } catch (error) {
    const project = demoStore.projects.find((item) => item.id === projectId);
    if (project?.htmlPath === expectedHtmlPath) {
      project.previewStatus = "failed";
      project.previewError = error instanceof Error ? error.message.slice(0, 500) : "未知错误";
    } else {
      return;
    }
    throw error;
  } finally {
    await browser?.close().catch(() => undefined);
  }
}

export function captureProjectPreview(projectId: string, htmlPath: string, ownerId: string) {
  captureQueue = captureQueue
    .then(() => performCapture(projectId, htmlPath, ownerId))
    .catch((error) => console.error("原型首页截图生成失败", error));
  return captureQueue;
}

export function captureDemoProjectPreview(
  projectId: string,
  publicCode: string,
  account: string,
  expectedHtmlPath: string,
) {
  captureQueue = captureQueue
    .then(() => performDemoCapture(projectId, publicCode, account, expectedHtmlPath))
    .catch((error) => console.error("演示原型首页截图生成失败", error));
  return captureQueue;
}
