import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { describe, expect, it } from "vitest";
import { config } from "../proxy";

describe("proxy matcher", () => {
  it.each([
    ["/api/projects", {}],
    ["/api/projects/project-id/file", {}],
    ["/manage/api/projects", { basePath: "/manage" }],
    ["/manage/api/projects/project-id/file", { basePath: "/manage" }],
  ])("不代理原型上传接口 %s", (url, nextConfig) => {
    expect(unstable_doesMiddlewareMatch({ config, nextConfig, url })).toBe(
      false,
    );
  });

  it.each([
    ["/projects", {}],
    ["/api/auth/login", {}],
    ["/manage/projects", { basePath: "/manage" }],
    ["/manage/api/auth/login", { basePath: "/manage" }],
    ["/manage/project/demo-code/", { basePath: "/manage" }],
  ])("继续代理普通页面和非上传接口 %s", (url, nextConfig) => {
    expect(unstable_doesMiddlewareMatch({ config, nextConfig, url })).toBe(
      true,
    );
  });
});
