import { describe, expect, it } from "vitest";
import { viewerReturnTo } from "@/lib/viewer-response";

describe("viewerReturnTo", () => {
  it("为 Next.js 剥离基础路径后的请求补回 /manage", () => {
    const result = viewerReturnTo(
      "https://prototype-demo.example.com/project/demo123/?from=square",
      "https://prototype-demo.example.com/manage",
    );

    expect(result.toString()).toBe(
      "https://prototype-demo.example.com/manage/project/demo123/?from=square",
    );
  });

  it("使用配置的演示域名，避免信任请求 Host", () => {
    const result = viewerReturnTo(
      "https://untrusted.example/project/demo123/",
      "https://prototype-demo.example.com/manage",
    );

    expect(result.origin).toBe("https://prototype-demo.example.com");
    expect(result.pathname).toBe("/manage/project/demo123/");
  });

  it("请求路径已有基础路径时不会重复添加", () => {
    const result = viewerReturnTo(
      "https://prototype-demo.example.com/manage/project/demo123/",
      "https://prototype-demo.example.com/manage",
    );

    expect(result.pathname).toBe("/manage/project/demo123/");
  });
});
