import { describe, expect, it } from "vitest";
import { readRequestJson } from "@/lib/request-json";

describe("readRequestJson", () => {
  it("读取合法 JSON", async () => {
    const request = new Request("http://localhost/api", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "测试" }),
    });
    await expect(readRequestJson(request)).resolves.toEqual({ name: "测试" });
  });

  it.each(["", "{"])("无效 JSON 返回 null", async (body) => {
    const request = new Request("http://localhost/api", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    });
    await expect(readRequestJson(request)).resolves.toBeNull();
  });
});
