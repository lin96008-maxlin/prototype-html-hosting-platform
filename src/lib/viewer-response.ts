import { NextResponse } from "next/server";
import { normalizeBasePath, prefixWithBasePath, urlUnderBase } from "@/lib/app-path";
import { env } from "@/lib/env";
import { VISITOR_COOKIE } from "@/lib/visitor-session";

export function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function redirectToLogin(requestUrl: string) {
  const login = new URL(urlUnderBase(env.manageUrl, "/login"));
  const returnTo = viewerReturnTo(requestUrl, env.demoUrl);
  login.searchParams.set("returnTo", returnTo.toString());
  return NextResponse.redirect(login);
}

export function viewerReturnTo(requestUrl: string, demoUrl: string) {
  const requested = new URL(requestUrl);
  const returnTo = new URL(demoUrl);
  const demoBasePath = normalizeBasePath(returnTo.pathname);
  returnTo.pathname = prefixWithBasePath(requested.pathname, demoBasePath);
  returnTo.search = requested.search;
  returnTo.hash = "";
  return returnTo;
}

export function attachVisitorCookie(response: NextResponse, visitorId: string) {
  response.cookies.set(VISITOR_COOKIE, visitorId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 365 * 24 * 60 * 60,
  });
  return response;
}

function withBasePath(html: string, basePath: string) {
  if (/<base\s/i.test(html)) return html;
  const normalized = `/${basePath.replace(/^\/+|\/+$/g, "")}/`;
  const base = `<base href="${escapeHtml(normalized)}">`;
  return /<head(?:\s[^>]*)?>/i.test(html)
    ? html.replace(/<head(?:\s[^>]*)?>/i, (head) => `${head}${base}`)
    : `${base}${html}`;
}

export function prototypeHtmlResponse(
  html: string,
  options: { basePath: string; visitorId?: string },
) {
  const response = new NextResponse(withBasePath(html, options.basePath), {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "private, no-store, max-age=0",
      "x-content-type-options": "nosniff",
      "referrer-policy": "same-origin",
    },
  });
  return options.visitorId ? attachVisitorCookie(response, options.visitorId) : response;
}

export function assetContentType(assetPath: string) {
  const extension = assetPath.toLowerCase().split(".").pop() ?? "";
  const types: Record<string, string> = {
    html: "text/html; charset=utf-8",
    htm: "text/html; charset=utf-8",
    css: "text/css; charset=utf-8",
    js: "text/javascript; charset=utf-8",
    mjs: "text/javascript; charset=utf-8",
    json: "application/json; charset=utf-8",
    svg: "image/svg+xml",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
    ico: "image/x-icon",
    woff: "font/woff",
    woff2: "font/woff2",
    ttf: "font/ttf",
    eot: "application/vnd.ms-fontobject",
    mp3: "audio/mpeg",
    mp4: "video/mp4",
    pdf: "application/pdf",
    xml: "application/xml; charset=utf-8",
    txt: "text/plain; charset=utf-8",
  };
  return types[extension] ?? "application/octet-stream";
}

export function prototypeAssetResponse(content: Uint8Array, assetPath: string, visitorId?: string) {
  const response = new NextResponse(Buffer.from(content), {
    headers: {
      "content-type": assetContentType(assetPath),
      "cache-control": "private, no-store, max-age=0",
      "x-content-type-options": "nosniff",
      "referrer-policy": "same-origin",
    },
  });
  return visitorId ? attachVisitorCookie(response, visitorId) : response;
}

export function viewerMessagePage(input: {
  title: string;
  message: string;
  code?: number;
  passwordForm?: boolean;
  error?: string;
}) {
  const error = input.error ? `<div class="error">${escapeHtml(input.error)}</div>` : "";
  const form = input.passwordForm
    ? `<form method="post"><label for="share-password">访问密码</label><div class="row"><input id="share-password" name="password" type="password" autofocus required maxlength="64" placeholder="请输入分享密码"><button type="submit">访问原型</button></div></form>`
    : `<a href="${escapeHtml(urlUnderBase(env.manageUrl, "/projects"))}">返回原型中心</a>`;
  const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(input.title)}</title><style>*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;color:#223355;background:#f5f7fa;font:14px "Microsoft YaHei",sans-serif}.box{width:min(460px,100%);padding:32px;border:1px solid #dde1eb;border-radius:8px;background:#fff}.mark{width:44px;height:44px;display:grid;place-items:center;margin-bottom:24px;color:#fff;border-radius:8px;background:#3388ff;font-weight:700}h1{margin:0 0 10px;color:#081126;font-size:22px}p{margin:0 0 24px;color:#6b7a99;line-height:1.7}label{display:block;margin-bottom:8px}.row{display:grid;grid-template-columns:1fr auto;gap:8px}input{height:40px;padding:0 10px;border:1px solid #dde1eb;border-radius:4px;outline:none}input:focus{border-color:#3388ff;box-shadow:0 0 0 2px #d6edff}button,a{height:40px;display:inline-flex;align-items:center;justify-content:center;padding:0 18px;color:#fff;border:0;border-radius:4px;background:#3388ff;text-decoration:none;cursor:pointer}.error{margin-bottom:12px;color:#ff4433}</style></head><body><main class="box"><div class="mark">E</div><h1>${escapeHtml(input.title)}</h1><p>${escapeHtml(input.message)}</p>${error}${form}</main></body></html>`;
  return new NextResponse(html, {
    status: input.code ?? 200,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}
