import { describe, expect, it } from "vitest";
import { createShareGrant, verifyShareGrant } from "@/lib/share-session";

describe("分享访问授权", () => {
  it("分享版本变化后旧授权立即失效", async () => {
    const token = await createShareGrant("project-1", "visitor-1", 3);
    await expect(verifyShareGrant(token, "project-1", "visitor-1", 3)).resolves.toBe(true);
    await expect(verifyShareGrant(token, "project-1", "visitor-1", 4)).resolves.toBe(false);
    await expect(verifyShareGrant(token, "project-1", "visitor-2", 3)).resolves.toBe(false);
  });
});
