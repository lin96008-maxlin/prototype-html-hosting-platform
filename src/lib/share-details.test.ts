import { describe, expect, it } from "vitest";
import { formatShareDetails } from "@/lib/share-details";
import type { PrototypeProject } from "@/lib/types";

const project = { name: "测试原型", sharePassword: "123456" } as PrototypeProject;

describe("formatShareDetails", () => {
  it("包含原型名称、分享链接和访问密码", () => {
    expect(formatShareDetails(project, "https://demo.example/share/abc/")).toBe(
      "原型名称：测试原型\n分享链接：https://demo.example/share/abc/\n访问密码：123456",
    );
  });

  it("没有密码时省略密码行", () => {
    expect(formatShareDetails({ ...project, sharePassword: "" }, "https://demo.example/share/abc/"))
      .toBe("原型名称：测试原型\n分享链接：https://demo.example/share/abc/");
  });

  it("设置截止时间后包含截止时间", () => {
    expect(formatShareDetails({ ...project, shareExpiresAt: "2026-08-08T02:00:00.000Z" }, "https://demo.example/share/abc/"))
      .toContain("截止时间：");
  });
});
