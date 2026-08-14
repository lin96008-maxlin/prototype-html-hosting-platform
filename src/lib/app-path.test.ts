import { describe, expect, it } from "vitest";
import { normalizeBasePath, prefixWithBasePath } from "@/lib/app-path";

describe("app-path", () => {
  it.each([
    [undefined, ""],
    ["/", ""],
    ["manage", "/manage"],
    ["/manage/", "/manage"],
  ])("规范化基础路径 %s", (input, expected) => {
    expect(normalizeBasePath(input)).toBe(expected);
  });

  it("添加基础路径且不会重复添加", () => {
    expect(prefixWithBasePath("/login", "/manage")).toBe("/manage/login");
    expect(prefixWithBasePath("/manage/login", "/manage")).toBe("/manage/login");
  });

  it("拒绝相对路径", () => {
    expect(() => prefixWithBasePath("login", "/manage")).toThrow("应用路径必须以 / 开头");
  });
});
