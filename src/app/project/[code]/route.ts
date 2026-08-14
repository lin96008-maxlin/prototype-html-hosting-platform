import { getCurrentUser } from "@/lib/auth";
import { decideProjectAccess } from "@/lib/access-policy";
import { getProjectByCode } from "@/lib/data";
import { getAllowedDepartmentIds } from "@/lib/department-scope";
import { withBasePath } from "@/lib/app-path";
import { getProjectHtml, recordProjectVisit } from "@/lib/project-content";
import { prototypeHtmlResponse, redirectToLogin, viewerMessagePage } from "@/lib/viewer-response";

export async function GET(
  request: Request,
  context: { params: Promise<{ code: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return redirectToLogin(request.url);
  const { code } = await context.params;
  const project = await getProjectByCode(code, "public");
  if (!project) {
    return viewerMessagePage({ title: "原型不存在", message: "链接无效或原型已被删除。", code: 404 });
  }
  const allowedDepartmentIds = await getAllowedDepartmentIds(user);
  const decision = decideProjectAccess({
    actor: user,
    project,
    route: "public",
    allowedDepartmentIds,
  });
  if (!decision.allowed) {
    return viewerMessagePage({ title: "原型未公开", message: "该原型当前未在公开广场开放。", code: 403 });
  }
  const accessType = user.id === project.ownerId ? "owner" : user.role === "user" ? "public" : "admin";
  if (request.headers.get("x-prototype-preview-capture") !== "1") {
    await recordProjectVisit(project, user.id, null, accessType);
  }
  return prototypeHtmlResponse(await getProjectHtml(project), {
    basePath: withBasePath(`/project/${encodeURIComponent(code)}/`),
  });
}
