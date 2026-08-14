import { describe, expect, it } from "vitest";
import { toDatetimeLocalValue } from "@/lib/datetime-local";

describe("toDatetimeLocalValue", () => {
  it("按浏览器本地时区回填 datetime-local", () => {
    const value = "2026-08-13T04:00:00.000Z";
    const date = new Date(value);
    const expected = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
      .toISOString()
      .slice(0, 16);

    expect(toDatetimeLocalValue(value)).toBe(expected);
  });

  it("空值和无效时间返回空字符串", () => {
    expect(toDatetimeLocalValue(null)).toBe("");
    expect(toDatetimeLocalValue("invalid-date")).toBe("");
  });
});
