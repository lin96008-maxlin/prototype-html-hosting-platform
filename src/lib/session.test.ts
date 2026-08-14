import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => vi.unstubAllEnvs());

describe("登录会话", () => {
  it("会话同时绑定用户和密码版本", async () => {
    vi.stubEnv("SESSION_SIGNING_SECRET", "test-session-signing-secret-32-characters");
    vi.resetModules();
    const { createSessionToken, verifySessionToken } = await import("@/lib/session");
    const token = await createSessionToken("user-1", 4);
    await expect(verifySessionToken(token)).resolves.toEqual({
      userId: "user-1",
      sessionVersion: 4,
    });
  });
});
