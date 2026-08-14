import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { decideProjectAccess } from "@/lib/access-policy";
import { getProjectByCode } from "@/lib/data";
import { getProjectAsset } from "@/lib/project-content";
import { shareCookieName, verifyShareGrant } from "@/lib/share-session";
import { prototypeAssetResponse } from "@/lib/viewer-response";
import { resolveVisitorId, VISITOR_COOKIE } from "@/lib/visitor-session";

export async function GET(
  _request: Request,
  context: { params: Promise<{ code: string; asset: string[] }> },
) {
  const user = await getCurrentUser();
  const { code, asset } = await context.params;
  const project = await getProjectByCode(code, "share");
  if (!project) return new NextResponse("资源不存在", { status: 404 });
  const cookieStore = await cookies();
  const visitorId = resolveVisitorId(cookieStore.get(VISITOR_COOKIE)?.value);
  const verified = await verifyShareGrant(
    cookieStore.get(shareCookieName(project.id))?.value,
    project.id,
    visitorId,
    project.shareVersion,
  );
  const decision = decideProjectAccess({ actor: user, project, route: "share", passwordVerified: verified });
  if (!decision.allowed) return new NextResponse("无权访问", { status: 403 });
  try {
    const assetPath = asset.join("/");
    return prototypeAssetResponse(await getProjectAsset(project, assetPath), assetPath, visitorId);
  } catch {
    return new NextResponse("资源不存在", { status: 404 });
  }
}
