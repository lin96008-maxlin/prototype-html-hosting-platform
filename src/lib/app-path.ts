export function normalizeBasePath(value: string | undefined) {
  const trimmed = value?.trim();
  if (!trimmed || trimmed === "/") return "";
  return `/${trimmed.replace(/^\/+|\/+$/g, "")}`;
}

export const appBasePath = normalizeBasePath(process.env.NEXT_PUBLIC_BASE_PATH);

export function prefixWithBasePath(pathname: string, basePath: string) {
  if (!pathname.startsWith("/")) throw new Error("应用路径必须以 / 开头");
  if (!basePath || pathname === basePath || pathname.startsWith(`${basePath}/`)) {
    return pathname;
  }
  return `${basePath}${pathname}`;
}

export function withBasePath(pathname: string) {
  return prefixWithBasePath(pathname, appBasePath);
}

export function urlUnderBase(baseUrl: string, pathname: string) {
  if (!pathname.startsWith("/")) throw new Error("URL 路径必须以 / 开头");
  return `${baseUrl.replace(/\/+$/g, "")}${pathname}`;
}
