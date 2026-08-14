import { compare } from "bcryptjs";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { urlUnderBase, withBasePath } from "@/lib/app-path";
import { decideProjectAccess } from "@/lib/access-policy";
import { getProjectByCode } from "@/lib/data";
import { query } from "@/lib/db";
import { demoStore } from "@/lib/demo-store";
import { env, isDemoMode } from "@/lib/env";
import { getProjectHtml, recordProjectVisit } from "@/lib/project-content";
import { getClientIp, rejectInvalidViewerOrigin } from "@/lib/security";
import { createShareGrant, shareCookieName, verifyShareGrant } from "@/lib/share-session";
import { attachVisitorCookie, prototypeHtmlResponse, viewerMessagePage } from "@/lib/viewer-response";
import { resolveVisitorId, VISITOR_COOKIE } from "@/lib/visitor-session";

function closedReason(reason: string) {
  if (reason === "share_expired") return "分享已过期";
  return "分享已关闭";
}

export async function GET(
  request: Request,
  context: { params: Promise<{ code: string }> },
) {
  const user = await getCurrentUser();
  const { code } = await context.params;
  const project = await getProjectByCode(code, "share");
  if (!project) {
    return viewerMessagePage({ title: "分享不存在", message: "链接无效或原型已被删除。", code: 404 });
  }
  const cookieStore = await cookies();
  const visitorId = resolveVisitorId(cookieStore.get(VISITOR_COOKIE)?.value);
  const verified = await verifyShareGrant(
    cookieStore.get(shareCookieName(project.id))?.value,
    project.id,
    visitorId,
    project.shareVersion,
  );
  const decision = decideProjectAccess({ actor: user, project, route: "share", passwordVerified: verified });
  if (decision.needsPassword) {
    return viewerMessagePage({
      title: "访问受保护的原型",
      message: `${project.name} 设置了分享密码。`,
      passwordForm: true,
    });
  }
  if (!decision.allowed) {
    const title = closedReason(decision.reason);
    return viewerMessagePage({ title, message: "请联系原型负责人获取新的分享方式。", code: 403 });
  }
  if (request.headers.get("x-prototype-preview-capture") !== "1") {
    await recordProjectVisit(project, user?.id ?? null, user ? null : visitorId, "share");
  }
  return prototypeHtmlResponse(await getProjectHtml(project), {
    basePath: withBasePath(`/share/${encodeURIComponent(code)}/`),
    visitorId,
  });
}

async function isRateLimited(projectId: string, ipAddress: string | null) {
  if (isDemoMode) return false;
  const result = await query<{ failures: string }>(
    `select count(*)::text as failures
       from share_password_attempts
      where project_id = $1
        and ip_address is not distinct from $2::inet
        and success = false
        and created_at > now() - interval '15 minutes'`,
    [projectId, ipAddress],
  );
  return Number(result.rows[0]?.failures ?? 0) >= 10;
}

async function recordPasswordAttempt(projectId: string, ipAddress: string | null, success: boolean) {
  if (isDemoMode) return;
  await query(
    "insert into share_password_attempts (project_id, ip_address, success) values ($1, $2, $3)",
    [projectId, ipAddress, success],
  );
}

export async function POST(
  request: Request,
  context: { params: Promise<{ code: string }> },
) {
  const originError = rejectInvalidViewerOrigin(request);
  if (originError) return originError;
  const { code } = await context.params;
  const project = await getProjectByCode(code, "share");
  if (!project || !project.shareEnabled) {
    return viewerMessagePage({ title: "分享已关闭", message: "请联系原型负责人。", code: 403 });
  }
  if (project.shareExpiresAt && new Date(project.shareExpiresAt).getTime() <= Date.now()) {
    return viewerMessagePage({ title: "分享已过期", message: "请联系原型负责人。", code: 403 });
  }
  const ipAddress = getClientIp(request);
  if (await isRateLimited(project.id, ipAddress)) {
    return viewerMessagePage({
      title: "尝试次数过多",
      message: "请 15 分钟后再试，或联系原型负责人确认访问密码。",
      code: 429,
    });
  }
  const form = await request.formData();
  const password = String(form.get("password") ?? "");
  let valid = false;
  if (isDemoMode) {
    valid = demoStore.sharePasswords.get(project.id) === password;
  } else {
    const result = await query<{ share_password_hash: string | null }>(
      "select share_password_hash from projects where id = $1",
      [project.id],
    );
    const passwordHash = result.rows[0]?.share_password_hash;
    valid = Boolean(passwordHash && (await compare(password, passwordHash)));
  }
  await recordPasswordAttempt(project.id, ipAddress, valid);
  if (!valid) {
    return viewerMessagePage({
      title: "访问受保护的原型",
      message: `${project.name} 设置了分享密码。`,
      passwordForm: true,
      error: "访问密码错误",
      code: 401,
    });
  }
  const cookieStore = await cookies();
  const visitorId = resolveVisitorId(cookieStore.get(VISITOR_COOKIE)?.value);
  const grant = await createShareGrant(
    project.id,
    visitorId,
    project.shareVersion,
    project.shareExpiresAt,
  );
  const response = NextResponse.redirect(
    new URL(urlUnderBase(env.demoUrl, `/share/${encodeURIComponent(code)}/`)),
    303,
  );
  response.cookies.set(shareCookieName(project.id), grant, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: withBasePath(`/share/${code}`),
    maxAge: 86400,
  });
  return attachVisitorCookie(response, visitorId);
}
