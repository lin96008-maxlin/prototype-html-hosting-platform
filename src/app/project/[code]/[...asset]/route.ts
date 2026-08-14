import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { decideProjectAccess } from "@/lib/access-policy";
import { getProjectByCode } from "@/lib/data";
import { getAllowedDepartmentIds } from "@/lib/department-scope";
import { getProjectAsset } from "@/lib/project-content";
import { prototypeAssetResponse, redirectToLogin } from "@/lib/viewer-response";

export async function GET(
  request: Request,
  context: { params: Promise<{ code: string; asset: string[] }> },
) {
  const user = await getCurrentUser();
  if (!user) return redirectToLogin(request.url);
  const { code, asset } = await context.params;
  const project = await getProjectByCode(code, "public");
  if (!project) return new NextResponse("资源不存在", { status: 404 });
  const decision = decideProjectAccess({
    actor: user,
    project,
    route: "public",
    allowedDepartmentIds: await getAllowedDepartmentIds(user),
  });
  if (!decision.allowed) return new NextResponse("无权访问", { status: 403 });
  try {
    const assetPath = asset.join("/");
    return prototypeAssetResponse(await getProjectAsset(project, assetPath), assetPath);
  } catch {
    return new NextResponse("资源不存在", { status: 404 });
  }
}
