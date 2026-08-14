import { createHash } from "node:crypto";
import { expect, test, type APIRequestContext } from "@playwright/test";

async function createProject(request: APIRequestContext, name: string, color: string) {
  const html = `<!doctype html><html><body style="margin:0;width:100vw;height:100vh;background:${color}"><h1>${name}</h1></body></html>`;
  const response = await request.post("/api/projects", {
    multipart: {
      name,
      file: {
        name: `${name}.html`,
        mimeType: "text/html",
        buffer: Buffer.from(html),
      },
    },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  return (await response.json()).project as { id: string };
}

async function waitForPreview(request: APIRequestContext, projectId: string) {
  let previewUrl: string | null = null;
  await expect.poll(async () => {
    const response = await request.get(`/api/projects/${projectId}/preview`);
    const body = await response.json();
    previewUrl = body.preview.url;
    return body.preview.status;
  }, { timeout: 25_000 }).toBe("ready");
  expect(previewUrl).toBeTruthy();
  const response = await request.get(previewUrl!);
  expect(response.headers()["content-type"]).toContain("image/webp");
  return Buffer.from(await response.body());
}

async function updateProject(request: APIRequestContext, projectId: string, name: string, color: string) {
  const html = `<!doctype html><html><body style="margin:0;width:100vw;height:100vh;background:${color}"><h1>${name}</h1></body></html>`;
  const response = await request.post(`/api/projects/${projectId}/file`, {
    multipart: {
      file: {
        name: `${name}.html`,
        mimeType: "text/html",
        buffer: Buffer.from(html),
      },
    },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
}

test("不同原型会生成不同的真实预览图且截图不增加访问量", async ({ page, request }) => {
  await request.post("/api/test/reset");
  const login = await request.post("/api/auth/login", {
    data: { account: "admin", password: "Prototype@123" },
  });
  expect(login.ok()).toBeTruthy();

  const red = await createProject(request, "红色预览", "#ff0000");
  const green = await createProject(request, "绿色预览", "#00ff00");
  const redPreview = await waitForPreview(request, red.id);
  const greenPreview = await waitForPreview(request, green.id);

  expect(redPreview.byteLength).toBeGreaterThan(1000);
  expect(greenPreview.byteLength).toBeGreaterThan(1000);
  expect(createHash("sha256").update(redPreview).digest("hex"))
    .not.toBe(createHash("sha256").update(greenPreview).digest("hex"));

  await updateProject(request, red.id, "更新后的蓝色预览", "#0000ff");
  const updatedPreview = await waitForPreview(request, red.id);
  expect(createHash("sha256").update(updatedPreview).digest("hex"))
    .not.toBe(createHash("sha256").update(redPreview).digest("hex"));

  await page.goto("/login");
  await page.getByLabel("账号").fill("admin");
  await page.locator('input[name="password"]').fill("Prototype@123");
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await page.locator('[data-proto-app][data-hydrated="true"]').waitFor();
  await expect(page.locator(".prototype-card").filter({ hasText: "红色预览" }).locator(".prototype-preview i")).toHaveText("0");
  await expect(page.locator(".prototype-card").filter({ hasText: "绿色预览" }).locator(".prototype-preview i")).toHaveText("0");
});
