import { NextResponse, type NextRequest } from "next/server";

export function proxy(request: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    const host = request.headers.get("host")?.split(":")[0];
    const manageUrl = process.env.MANAGE_URL ?? process.env.NEXT_PUBLIC_MANAGE_URL;
    const demoUrl = process.env.DEMO_URL ?? process.env.NEXT_PUBLIC_DEMO_URL;
    const manageHost = manageUrl
      ? new URL(manageUrl).hostname
      : "prototype-demo.example.com";
    const demoHost = demoUrl
      ? new URL(demoUrl).hostname
      : "prototype-demo.example.com";
    if (manageHost === demoHost) return NextResponse.next({ request });
    const isViewerPath =
      request.nextUrl.pathname.startsWith("/project/") ||
      request.nextUrl.pathname.startsWith("/share/");

    if (host === manageHost && isViewerPath) {
      const target = request.nextUrl.clone();
      target.host = demoHost;
      return NextResponse.redirect(target);
    }
    if (host === demoHost && !isViewerPath && !request.nextUrl.pathname.startsWith("/_next/")) {
      const target = request.nextUrl.clone();
      target.host = manageHost;
      return NextResponse.redirect(target);
    }
  }
  return NextResponse.next({ request });
}

export const config = {
  matcher: ["/((?!api/projects(?:/[^/]+/file)?/?$|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
