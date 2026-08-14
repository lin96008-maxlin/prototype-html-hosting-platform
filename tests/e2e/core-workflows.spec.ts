import { expect, test, type Page } from "@playwright/test";
import { existsSync } from "node:fs";
import JSZip from "jszip";
import path from "node:path";

const fixtureHtml = path.resolve("tests/fixtures/订单协同工作台.html");
const actualPrototypeFolder = process.env.ACTUAL_PROTOTYPE_FOLDER;
const actualPrototypeRar = process.env.ACTUAL_PROTOTYPE_RAR;
const hostingPlatformTestFolder = "C:\\Users\\Linzi\\Desktop\\托管平台测试";
const browserErrors = new WeakMap<Page, string[]>();

async function login(
  page: Page,
  account = "admin",
  password = "Prototype@123",
  destination: "platform" | "change-password" = "platform",
) {
  await page.goto("/login");
  await page.getByLabel("账号").fill(account);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole("button", { name: "登录", exact: true }).click();
  if (destination === "platform") {
    await page.locator('[data-proto-app][data-hydrated="true"]').waitFor();
  } else {
    await expect(page).toHaveURL(/\/change-password$/);
    await expect(page.getByText("当前为临时密码，请修改后继续使用平台")).toBeVisible();
  }
}

async function logout(page: Page) {
  await page.locator('[data-proto-app][data-hydrated="true"]').waitFor();
  await page.locator(".topnav-user").click();
  await page.getByRole("menuitem", { name: "退出登录", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
}

test.beforeEach(async ({ page, request }) => {
  const errors: string[] = [];
  browserErrors.set(page, errors);
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error" && !message.text().startsWith("Failed to load resource:")) {
      errors.push(message.text());
    }
  });
  page.on("response", (response) => {
    if (response.status() >= 500) errors.push(`${response.status()} ${response.url()}`);
  });
  const response = await request.post("/api/test/reset");
  expect(response.ok()).toBeTruthy();
});

test.afterEach(async ({ page }) => {
  expect(browserErrors.get(page) ?? []).toEqual([]);
});

test("导航结构、部门原型筛选和无页签结构正确", async ({ page }) => {
  await login(page);
  await expect(page).toHaveURL(/\/projects$/);
  const groupTreeBox = await page.locator(".group-tree").boundingBox();
  expect(groupTreeBox).not.toBeNull();
  expect(groupTreeBox!.width).toBeGreaterThanOrEqual(220);

  const projectSearch = page.getByPlaceholder("搜索原型名称");
  await projectSearch.fill("不存在的原型名称");
  const emptyState = page.locator(".projects-main .empty-state");
  await expect(emptyState).toBeVisible();
  await expect(emptyState.locator(":scope > svg")).toHaveCSS("margin-bottom", "16px");
  await expect(emptyState.locator(".ui-button svg")).toHaveCSS("margin-bottom", "0px");
  await projectSearch.fill("");

  const sideNav = page.locator(".sidenav");
  await expect(sideNav.getByRole("link")).toHaveCount(7);
  await expect(sideNav.getByText("原型管理", { exact: true })).toBeVisible();
  await expect(sideNav.getByText("系统管理", { exact: true })).toBeVisible();
  await expect(sideNav.getByRole("link", { name: "我的原型" })).toBeVisible();
  await expect(sideNav.getByRole("link", { name: "部门原型" })).toBeVisible();
  await expect(sideNav.getByRole("link", { name: "公开广场" })).toBeVisible();
  await expect(sideNav.getByRole("link", { name: "部门人员" })).toBeVisible();
  await expect(page.locator(".tab-bar")).toHaveCount(0);
  await expect(page.getByTitle(/^关闭/)).toHaveCount(0);

  await sideNav.getByRole("link", { name: "部门原型" }).click();
  await expect(page).toHaveURL(/\/admin\/projects$/);
  await expect(page.getByRole("heading", { name: "部门原型" })).toBeVisible();
  await expect(page.locator(".admin-project-depts")).toBeVisible();
  const departmentBox = await page.locator(".admin-project-depts").boundingBox();
  expect(departmentBox).not.toBeNull();
  expect(departmentBox!.width).toBeGreaterThanOrEqual(220);
  await expect(page.locator(".group-tree")).toHaveCount(0);
  await expect(page.getByText("原型分组", { exact: true })).toHaveCount(0);
  await expect(page.locator(".admin-project-main .projects-toolbar").getByRole("combobox")).toHaveCount(0);
  await expect(page.locator(".admin-project-main .prototype-card").first().locator(".prototype-meta")).toContainText("更新");
  await page.getByTitle("列表视图").click();
  await expect(page.getByRole("columnheader", { name: "更新时间" })).toBeVisible();
  await page.getByTitle("卡片视图").click();
  await page.locator(".admin-project-main .prototype-card").first().getByRole("button", { name: "编辑" }).click();
  const departmentEditDialog = page.getByRole("dialog");
  await expect(departmentEditDialog.getByText("原负责人分组", { exact: true })).toHaveCount(0);
  await departmentEditDialog.getByRole("button", { name: "取消" }).click();
  await page.locator(".admin-project-main .prototype-card").first().getByRole("button", { name: "分享", exact: true }).click();
  const departmentShareDialog = page.getByRole("dialog");
  await expect(departmentShareDialog.getByRole("heading", { name: "分享设置" })).toBeVisible();
  await expect(departmentShareDialog).toContainText("开启后，获得分享链接的人员可访问原型。");
  await expect(departmentShareDialog).not.toContainText("公开广场");
  await expect(departmentShareDialog.getByTitle("复制分享信息")).toBeVisible();
  await departmentShareDialog.getByRole("button", { name: "取消" }).click();

  await page.locator(".sidenav").getByRole("link", { name: "公开广场" }).click();
  await expect(page).toHaveURL(/\/square$/);
  await expect(page.locator(".tab-bar")).toHaveCount(0);
  const squareCard = page.locator(".square-card").first();
  await expect(squareCard).toHaveClass(/prototype-card/);
  await expect(squareCard.locator(".prototype-preview i")).toBeVisible();
  await expect(squareCard.locator(".prototype-title-tags .status-tag")).toBeVisible();
  await expect(squareCard.locator(".prototype-meta")).toContainText("更新");
  await sideNav.getByRole("link", { name: "我的原型" }).click();
  await expect(page).toHaveURL(/\/projects$/);
  await expect(page.locator(".tab-bar")).toHaveCount(0);
  await expect(page.getByTitle(/^关闭/)).toHaveCount(0);
});

test("卡片操作根据卡片宽度在图标文字和纯图标之间自适应", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await login(page);

  for (const pathName of ["/projects", "/admin/projects"]) {
    await page.goto(pathName);
    const card = page.locator(".prototype-card").first();
    const actions = card.locator(".prototype-actions");
    await expect(actions).toBeVisible();

    const buttons = actions.locator("button");
    expect(await buttons.count()).toBeGreaterThanOrEqual(6);
    await expect(actions.getByText("编辑", { exact: true })).toBeVisible();
    await expect(actions.getByText("更新", { exact: true })).toBeVisible();
    await expect(actions.getByText("下载", { exact: true })).toBeVisible();

    await page.setViewportSize({ width: 1280, height: 720 });
    await expect(actions.locator(".action-label").first()).toBeHidden();

    const actionBox = await actions.boundingBox();
    expect(actionBox).not.toBeNull();
    for (let index = 0; index < await buttons.count(); index += 1) {
      const button = buttons.nth(index);
      await expect(button).toHaveAttribute("title", /.+/);
      await expect(button).toHaveAttribute("aria-label", /.+/);
      const buttonBox = await button.boundingBox();
      expect(buttonBox).not.toBeNull();
      expect(buttonBox!.x).toBeGreaterThanOrEqual(actionBox!.x);
      expect(buttonBox!.x + buttonBox!.width).toBeLessThanOrEqual(actionBox!.x + actionBox!.width + 0.5);
    }
    await page.setViewportSize({ width: 1920, height: 1080 });
  }
});

test("减少动态效果时预览生成图标仍提供缓慢反馈", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await login(page);
  await page.evaluate(() => {
    const loading = document.createElement("span");
    loading.className = "preview-loading";
    loading.dataset.testid = "preview-loading-animation";
    loading.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12a9 9 0 1 1-6.2-8.56" /></svg>';
    document.body.appendChild(loading);
  });

  const loading = page.getByTestId("preview-loading-animation");
  const icon = loading.locator("svg");
  await expect(icon).toHaveCSS("animation-name", "preview-spin");
  await expect(icon).toHaveCSS("animation-duration", "2.4s");
  await expect(icon).toHaveCSS("animation-timing-function", "linear");
  await expect(icon).toHaveCSS("animation-iteration-count", "infinite");
  const initialTransform = await icon.evaluate((element) => getComputedStyle(element).transform);
  await page.waitForTimeout(350);
  const nextTransform = await icon.evaluate((element) => getComputedStyle(element).transform);
  expect(nextTransform).not.toBe(initialTransform);

  await loading.evaluate((element) => element.classList.add("is-failed"));
  await expect(icon).toHaveCSS("animation-name", "none");
});

test("各业务页面标题字号和标题区分隔线保持一致", async ({ page }) => {
  await login(page);
  const pages = [
    ["/projects", "我的原型"],
    ["/admin/projects", "部门原型"],
    ["/square", "公开广场"],
    ["/admin/organization", "人员管理"],
    ["/admin/invitations", "邀请码"],
    ["/admin/categories", "业务分类"],
    ["/admin/analytics", "平台数据情况"],
  ] as const;

  for (const [url, title] of pages) {
    await page.goto(url);
  await page.locator('[data-proto-app][data-hydrated="true"]').waitFor();
    const heading = page.getByRole("heading", { name: title, level: 1 });
    await expect(heading).toBeVisible();
    const style = await heading.evaluate((node) => {
      const computed = getComputedStyle(node);
      let current: Element | null = node;
      let hasDivider = false;
      while (current && current !== document.body) {
        if (getComputedStyle(current).borderBottomWidth === "1px") {
          hasDivider = true;
          break;
        }
        current = current.parentElement;
      }
      return { fontSize: computed.fontSize, fontWeight: computed.fontWeight, hasDivider };
    });
    expect(style).toEqual({ fontSize: "16px", fontWeight: "600", hasDivider: true });
  }
});

test("多级分组、当前分组上传、自动命名和分享复制可用", async ({ context, page }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await login(page);
  await expect(page).toHaveURL(/\/projects$/);

  await page.locator(".group-tree-name").filter({ hasText: "近期项目" }).click({ position: { x: 42, y: 18 } });
  const parentGroup = page.locator(".group-tree-row").filter({ hasText: "近期项目" });
  await parentGroup.hover();
  await parentGroup.getByTitle("新增下级分组").click();
  const groupDialog = page.getByRole("dialog");
  await expect(groupDialog.getByRole("heading", { name: "新增分组" })).toBeVisible();
  await groupDialog.getByLabel("分组名称").fill("本周验收");
  await expect(groupDialog.getByRole("combobox")).toContainText("近期项目");
  await groupDialog.getByRole("button", { name: "保存" }).click();

  const newGroup = page.locator(".group-tree-name").filter({ hasText: "本周验收" });
  await expect(newGroup).toBeVisible();
  await newGroup.click({ position: { x: 42, y: 18 } });
  await page.getByRole("button", { name: "上传原型" }).first().click();

  const uploadDialog = page.getByRole("dialog");
  await uploadDialog.locator('input[type="file"]').first().setInputFiles(fixtureHtml);
  await expect(uploadDialog.getByLabel("原型名称")).toHaveValue("订单协同工作台");
  await expect(uploadDialog.getByRole("combobox")).toContainText("近期项目 / 本周验收");
  await page.route("**/api/projects", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 400));
    await route.continue();
  }, { times: 1 });
  const uploadResponse = page.waitForResponse((response) =>
    response.url().endsWith("/api/projects") && response.request().method() === "POST",
  );
  await uploadDialog.getByRole("button", { name: "确认上传" }).click();
  await expect(uploadDialog.getByRole("progressbar")).toBeVisible();
  await expect(uploadDialog).toContainText(/正在上传|服务器处理中/);
  expect((await uploadResponse).ok()).toBeTruthy();
  await expect(uploadDialog).toBeHidden();

  await expect(page.getByRole("link", { name: "订单协同工作台", exact: true })).toBeVisible();
  await page.getByTitle("列表视图").click();
  const row = page.getByRole("row").filter({ hasText: "订单协同工作台" });
  await expect(row).toContainText("本周验收");

  await row.getByTitle("更新").click();
  const updateDialog = page.getByRole("dialog");
  const zip = new JSZip();
  zip.file("联调项目/index.html", "<!doctype html><html lang=\"zh-CN\"><head><link rel=\"stylesheet\" href=\"assets/theme.css\"></head><body><h1>ZIP 原型</h1></body></html>");
  zip.file("联调项目/assets/theme.css", "body{color:#123456}");
  const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });
  await updateDialog.locator('input[type="file"]').first().setInputFiles({
    name: "联调项目.zip",
    mimeType: "application/zip",
    buffer: zipBuffer,
  });
  const updateResponse = page.waitForResponse((response) => response.url().includes("/api/projects/") && response.url().endsWith("/file") && response.request().method() === "POST");
  await updateDialog.getByRole("button", { name: "确认更新" }).click();
  expect((await updateResponse).ok()).toBeTruthy();
  await expect(updateDialog).toBeHidden();
  await page.waitForLoadState("networkidle");
  const projectHref = await row.locator(".table-project-name").getAttribute("href");
  expect(projectHref).toBeTruthy();
  const assetResponse = await page.request.get(`${projectHref!.replace(/\/$/, "")}/assets/theme.css`);
  const assetBody = await assetResponse.text();
  expect(assetResponse.status(), assetBody).toBe(200);
  expect(assetBody).toBe("body{color:#123456}");

  await row.getByRole("button", { name: "分享", exact: true }).click();
  const shareDialog = page.getByRole("dialog");
  await expect(shareDialog).toContainText("开启后，获得分享链接的人员可访问原型。");
  await expect(shareDialog).not.toContainText("公开广场");
  await shareDialog.getByRole("switch", { name: "开启分享" }).click();
  await shareDialog.getByLabel("访问密码").fill("Share@2026");
  const future = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const localFuture = new Date(future.getTime() - future.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
  await shareDialog.getByLabel("截止时间").fill(localFuture);
  await expect(shareDialog.locator(".share-details-preview")).toContainText("截止时间：");
  await shareDialog.getByRole("button", { name: "保存分享设置" }).click();
  await expect(page.getByText("分享链接和密码已自动复制")).toBeVisible();
  const clipboard = await page.evaluate(() => navigator.clipboard.readText());
  expect(clipboard).toContain("原型名称：订单协同工作台");
  expect(clipboard).toContain("分享链接：http://127.0.0.1:3100/share/");
  expect(clipboard).toContain("截止时间：");
  expect(clipboard).toContain("访问密码：Share@2026");
  await expect(row.locator(".table-share-link")).toBeVisible();
  await row.getByRole("button", { name: "分享", exact: true }).click();
  await expect(page.getByRole("dialog").getByLabel("访问密码")).toHaveValue("Share@2026");
  await page.getByRole("dialog").getByRole("button", { name: "复制分享信息" }).click();
  await expect(page.getByText("分享信息已复制")).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain("访问密码：Share@2026");
  await page.getByRole("dialog").getByRole("button", { name: "取消" }).click();

  await row.getByTitle("公开").click();
  const publicDialog = page.getByRole("dialog");
  await expect(publicDialog.getByText("公开地址", { exact: true })).toHaveCount(0);
  const publicSwitch = publicDialog.getByRole("switch", { name: "公开到广场" });
  await expect(publicSwitch).toHaveAttribute("aria-checked", "false");
  await publicSwitch.click();
  const categorySelect = publicDialog.getByRole("combobox");
  await categorySelect.press("ArrowDown");
  await expect(categorySelect).toHaveAttribute("aria-expanded", "true");
  await categorySelect.press("Enter");
  await expect(categorySelect).not.toContainText("请选择一级分类");
  await publicDialog.getByRole("button", { name: "保存公开设置" }).click();
  await expect(page.getByText("已公开到广场", { exact: true })).toBeVisible();
  await expect(row).not.toContainText("未公开");

  await row.getByTitle("公开").click();
  const closePublicDialog = page.getByRole("dialog");
  const closePublicSwitch = closePublicDialog.getByRole("switch", { name: "公开到广场" });
  await expect(closePublicSwitch).toHaveAttribute("aria-checked", "true");
  await closePublicSwitch.click();
  await expect(closePublicDialog.getByRole("combobox")).toHaveCount(0);
  await closePublicDialog.getByRole("button", { name: "保存公开设置" }).click();
  await expect(page.getByText("已取消公开", { exact: true })).toBeVisible();
  await expect(row).toContainText("未公开");
});

test("一级分组编辑时自动保留为一级分组", async ({ page }) => {
  await login(page);
  const parentGroup = page.locator(".group-tree-row").filter({ hasText: "近期项目" }).first();
  await parentGroup.click();
  await parentGroup.getByTitle("编辑分组").click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "编辑分组" })).toBeVisible();
  await expect(dialog.getByRole("combobox")).toContainText("无，作为一级分组");
  await dialog.getByLabel("分组名称").fill("近期项目编辑验证");
  const responsePromise = page.waitForResponse((response) =>
    response.url().includes("/api/groups/") && response.request().method() === "PATCH",
  );
  await dialog.getByRole("button", { name: "保存" }).click();
  expect((await responsePromise).ok()).toBeTruthy();
  await expect(page.getByText("分组信息已保存", { exact: true })).toBeVisible();
});

test("项目文件夹、RAR、原型资源路径及列表布局可用", async ({ page }) => {
  await login(page);

  const folderUpload = await page.evaluate(async () => {
    const form = new FormData();
    form.append("files", new File(["<!doctype html><html><body><script src='assets/app.js'></script></body></html>"], "index.html", { type: "text/html" }));
    form.append("paths", "文件夹联调/index.html");
    form.append("files", new File(["document.body.dataset.folder='ready'"], "app.js", { type: "text/javascript" }));
    form.append("paths", "文件夹联调/assets/app.js");
    const response = await fetch("/api/projects", { method: "POST", body: form });
    return { status: response.status, body: await response.json() };
  });
  expect(folderUpload.status).toBe(200);
  expect(folderUpload.body.project.name).toBe("文件夹联调");
  const folderAsset = await page.request.get(`/project/${folderUpload.body.project.publicCode}/assets/app.js`);
  expect(folderAsset.ok()).toBeTruthy();
  expect(await folderAsset.text()).toBe("document.body.dataset.folder='ready'");
  await page.goto(`/project/${folderUpload.body.project.publicCode}/`);
  await expect(page.locator("body")).toHaveAttribute("data-folder", "ready");
  await page.goto("/projects");
  await page.locator('[data-proto-app][data-hydrated="true"]').waitFor();

  const rarPath = path.resolve("tests/fixtures/rar-project.rar");
  await page.getByRole("button", { name: "上传原型" }).first().click();
  const rarDialog = page.getByRole("dialog");
  await rarDialog.locator('input[type="file"]').first().setInputFiles(rarPath);
  const rarResponsePromise = page.waitForResponse((response) =>
    response.url().endsWith("/api/projects") && response.request().method() === "POST",
  );
  await rarDialog.getByRole("button", { name: "确认上传" }).click();
  const rarResponse = await rarResponsePromise;
  expect(rarResponse.status(), await rarResponse.text()).toBe(200);
  await expect(rarDialog).toBeHidden();

  const largeUpload = await page.evaluate(async () => {
    const form = new FormData();
    const padding = "x".repeat(6 * 1024 * 1024);
    form.set("file", new File([`<!doctype html><html><body>${padding}</body></html>`], "六兆原型.html", { type: "text/html" }));
    const response = await fetch("/api/projects", { method: "POST", body: form });
    return { status: response.status, body: await response.json() };
  });
  expect(largeUpload.status).toBe(200);
  expect(largeUpload.body.project.fileSize).toBeGreaterThan(5 * 1024 * 1024);

  await page.evaluate(async () => {
    for (let index = 0; index < 16; index += 1) {
      await fetch("/api/groups", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: index === 0 ? "长期重点项目归档" : `滚动分组${index + 1}` }),
      });
    }
    for (let index = 0; index < 8; index += 1) {
      const form = new FormData();
      form.set("name", `分页原型${index + 1}`);
      form.set("file", new File([`<!doctype html><html><body>${index}</body></html>`], `分页原型${index + 1}.html`, { type: "text/html" }));
      await fetch("/api/projects", { method: "POST", body: form });
    }
  });
  await page.reload();
  await page.locator('[data-proto-app][data-hydrated="true"]').waitFor();

  const groupName = page.locator(".group-tree-name").filter({ hasText: "长期重点项目归档" });
  await expect(groupName).toBeVisible();
  const beforeHover = await groupName.boundingBox();
  const textFits = await groupName.locator("span").evaluate((node) => node.scrollWidth <= node.clientWidth + 1);
  expect(textFits).toBeTruthy();
  const groupRow = groupName.locator("..");
  await groupRow.hover();
  await expect(groupRow.locator(".group-row-actions")).toBeVisible();
  expect(await groupName.boundingBox()).toEqual(beforeHover);

  const treeMetrics = await page.locator(".group-tree-scroll").evaluate((node) => ({
    clientHeight: node.clientHeight,
    scrollHeight: node.scrollHeight,
    overflowY: getComputedStyle(node).overflowY,
  }));
  expect(treeMetrics.overflowY).toBe("auto");
  expect(treeMetrics.scrollHeight).toBeGreaterThan(treeMetrics.clientHeight);
  const sidebarBox = await page.locator(".group-tree").boundingBox();
  const storageBox = await page.locator(".storage-budget").boundingBox();
  expect(sidebarBox).not.toBeNull();
  expect(storageBox).not.toBeNull();
  expect(Math.abs(sidebarBox!.y + sidebarBox!.height - (storageBox!.y + storageBox!.height))).toBeLessThanOrEqual(16);

  const cards = page.locator(".prototype-card");
  await expect(cards).toHaveCount(12);
  const cardBoxes = await Promise.all([0, 1, 2, 3].map((index) => cards.nth(index).boundingBox()));
  expect(new Set(cardBoxes.slice(0, 3).map((box) => Math.round(box!.y))).size).toBe(1);
  expect(cardBoxes[3]!.y).toBeGreaterThan(cardBoxes[0]!.y);
  await expect(page.locator(".prototype-card .table-share-link")).toHaveCount(0);

  for (const viewport of [{ width: 1920, height: 1080 }, { width: 2560, height: 1440 }]) {
    await page.setViewportSize(viewport);
    const boxes = await Promise.all([0, 1, 2, 3, 4].map((index) => cards.nth(index).boundingBox()));
    expect(new Set(boxes.slice(0, 4).map((box) => Math.round(box!.y))).size).toBe(1);
    expect(boxes[4]!.y).toBeGreaterThan(boxes[0]!.y);
  }
  await page.setViewportSize({ width: 1280, height: 720 });

  const resultsMetrics = await page.locator(".projects-results").evaluate((node) => ({
    clientHeight: node.clientHeight,
    scrollHeight: node.scrollHeight,
    overflowY: getComputedStyle(node).overflowY,
  }));
  expect(resultsMetrics.overflowY).toBe("auto");
  expect(resultsMetrics.scrollHeight).toBeGreaterThan(resultsMetrics.clientHeight);
  const documentMetrics = await page.evaluate(() => ({
    clientHeight: document.documentElement.clientHeight,
    scrollHeight: document.documentElement.scrollHeight,
  }));
  expect(documentMetrics.scrollHeight).toBeLessThanOrEqual(documentMetrics.clientHeight + 1);

  const pageSizeTrigger = page.locator(".data-pagination-size").getByRole("combobox");
  const triggerBox = await pageSizeTrigger.boundingBox();
  await pageSizeTrigger.click();
  const panelBox = await page.getByRole("listbox").boundingBox();
  expect(triggerBox).not.toBeNull();
  expect(panelBox).not.toBeNull();
  expect(panelBox!.y + panelBox!.height).toBeLessThanOrEqual(triggerBox!.y + 1);
});

test("实际多文件项目文件夹可完成打包和上传", async ({ page }) => {
  test.skip(!actualPrototypeFolder || !existsSync(actualPrototypeFolder), "未提供实际原型目录");
  test.setTimeout(180_000);
  await login(page);
  await page.getByRole("button", { name: "上传原型" }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.locator("input.folder-input").setInputFiles(actualPrototypeFolder!);
  await expect(dialog).toContainText(/个文件/);
  const responsePromise = page.waitForResponse((response) =>
    response.url().endsWith("/api/projects") && response.request().method() === "POST",
    { timeout: 150_000 },
  );
  const progressValues: number[] = [];
  const progressTimer = setInterval(async () => {
    const value = await dialog.getByRole("progressbar").getAttribute("aria-valuenow").catch(() => null);
    if (value !== null) progressValues.push(Number(value));
  }, 100);
  await dialog.getByRole("button", { name: "确认上传" }).click();
  await expect(dialog.getByRole("progressbar")).toBeVisible();
  const response = await responsePromise;
  clearInterval(progressTimer);
  expect(response.status()).toBe(200);
  await expect(dialog).toBeHidden({ timeout: 150_000 });
  expect(progressValues.length).toBeGreaterThan(1);
  expect(progressValues.every((value, index) => index === 0 || value >= progressValues[index - 1])).toBe(true);
});

test("托管平台测试文件夹的 HTML 片段可完成上传", async ({ page }) => {
  test.skip(!existsSync(hostingPlatformTestFolder), "未找到托管平台测试文件夹");
  test.setTimeout(180_000);
  await login(page);
  await page.getByRole("button", { name: "上传原型" }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.locator("input.folder-input").setInputFiles(hostingPlatformTestFolder);
  await expect(dialog).toContainText("托管平台测试（8 个文件）");
  const responsePromise = page.waitForResponse((response) =>
    response.url().endsWith("/api/projects") && response.request().method() === "POST",
    { timeout: 150_000 },
  );
  await dialog.getByRole("button", { name: "确认上传" }).click();
  const response = await responsePromise;
  expect(response.status(), await response.text()).toBe(200);
  await expect(dialog).toBeHidden({ timeout: 150_000 });
  const projectLink = page.getByRole("link", { name: "托管平台测试", exact: true });
  await expect(projectLink).toBeVisible();
  const href = await projectLink.getAttribute("href");
  expect(href).toBeTruthy();
  const prototypeResponse = await page.request.get(href!);
  const prototypeHtml = await prototypeResponse.text();
  expect(prototypeResponse.ok(), prototypeHtml).toBeTruthy();
  expect(prototypeHtml.toLowerCase()).toContain("<base href=");
});

test("实际 RAR 原型可完成上传", async ({ page }) => {
  test.skip(!actualPrototypeRar || !existsSync(actualPrototypeRar), "未提供实际 RAR 原型");
  test.setTimeout(180_000);
  await login(page);
  await page.getByRole("button", { name: "上传原型" }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.locator('input[type="file"]').first().setInputFiles(actualPrototypeRar!);
  const responsePromise = page.waitForResponse((response) =>
    response.url().endsWith("/api/projects") && response.request().method() === "POST",
    { timeout: 150_000 },
  );
  await dialog.getByRole("button", { name: "确认上传" }).click();
  await expect(dialog.getByRole("progressbar")).toBeVisible();
  const response = await responsePromise;
  expect(response.status()).toBe(200);
  await expect(dialog).toBeHidden({ timeout: 150_000 });
});

test("平台数据使用服务器实时磁盘容量", async ({ page }) => {
  await login(page);
  await page.goto("/admin/analytics");
  await page.locator('[data-proto-app][data-hydrated="true"]').waitFor();
  const storage = page.locator(".analytics-section").filter({ hasText: "存储预算" });
  await expect(storage).toContainText("服务器整盘已用 / 磁盘总容量");
  await expect(storage).toContainText("原型文件");
  await expect(storage).toContainText("本机数据库备份");
  await expect(storage).toContainText("系统/数据库/其他");
  await expect(storage).toContainText("磁盘剩余可用");
  await expect(storage).toContainText("系统安全预留");
  await expect(storage).not.toContainText("10240.0 MB");
});

test("公开访问必须登录，分享访问独立且密码真正生效", async ({ context, page }) => {
  await page.goto("/share/s8Lw2Kp9/");
  await expect(page.getByRole("heading", { name: "访问受保护的原型" })).toBeVisible();
  await page.getByLabel("访问密码").fill("wrong-password");
  await page.getByRole("button", { name: "访问原型" }).click();
  await expect(page.getByText("访问密码错误")).toBeVisible();
  await page.getByLabel("访问密码").fill("prototype_demo");
  await page.getByRole("button", { name: "访问原型" }).click();
  await expect(page).toHaveURL(/\/share\/s8Lw2Kp9\/?$/);
  await expect(page.locator(".top")).toContainText("客户协作工作台");

  await context.clearCookies();
  await page.goto("/share/a9Vm3Rd6/");
  await expect(page.getByRole("heading", { name: "分享已关闭" })).toBeVisible();

  await page.goto("/project/qu3FeXz5/");
  await expect(page).toHaveURL(/\/login\?returnTo=/);
  await page.getByLabel("账号").fill("product01");
  await page.locator('input[name="password"]').fill("Prototype@123");
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await expect(page).toHaveURL(/\/project\/qu3FeXz5\/?$/);
  await expect(page.locator(".top")).toContainText("客户协作工作台");
});

test("管理员自定义临时密码后，用户下次登录必须修改", async ({ page }) => {
  const tempPassword = "TempPass@2026";
  const newPassword = "NewPass@2026";
  await login(page);
  await page.locator(".sidenav").getByRole("link", { name: "部门人员" }).click();
  await expect(page).toHaveURL(/\/admin\/organization$/);

  let row = page.getByRole("row").filter({ hasText: "product01" });
  await row.getByTitle("人员设置").click();
  let modal = page.locator(".modal");
  await modal.getByLabel("个人存储阈值").fill("512");
  await modal.getByRole("button", { name: "保存" }).click();
  await expect(modal).toBeHidden();
  await page.reload();
  await page.locator('[data-proto-app][data-hydrated="true"]').waitFor();
  row = page.getByRole("row").filter({ hasText: "product01" });
  await expect(row).toContainText("512.0MB");

  await row.getByTitle("重置密码").click();
  modal = page.locator(".modal");
  await expect(modal.getByRole("heading", { name: "重置密码 - 产品经理" })).toBeVisible();
  await modal.getByLabel("临时密码").fill(tempPassword);
  await modal.getByRole("button", { name: "确认重置" }).click();
  await expect(page.getByRole("heading", { name: "密码已重置" })).toBeVisible();
  await expect(page.getByText(tempPassword, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "我已记录" }).click();

  await logout(page);
  await login(page, "product01", tempPassword, "change-password");
  await expect(page).toHaveURL(/\/change-password$/);
  await expect(page.getByText("当前为临时密码，请修改后继续使用平台")).toBeVisible();
  await page.getByLabel("当前密码").fill(tempPassword);
  await page.getByLabel("新密码", { exact: true }).fill(newPassword);
  await page.getByLabel("确认新密码").fill(newPassword);
  await page.getByRole("button", { name: "更新密码" }).click();
  await expect(page).toHaveURL(/\/projects$/);

  await logout(page);
  await login(page, "product01", newPassword);
  await expect(page).toHaveURL(/\/projects$/);
});

test("管理员可创建人员并一次性复制完整登录信息", async ({ context, page }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await login(page);
  await page.goto("/admin/organization");
  await page.locator('[data-proto-app][data-hydrated="true"]').waitFor();

  const departmentPanel = page.locator(".department-panel");
  const departmentPanelBox = await departmentPanel.boundingBox();
  expect(departmentPanelBox).not.toBeNull();
  expect(departmentPanelBox!.width).toBeGreaterThanOrEqual(220);
  expect(departmentPanelBox!.width).toBeLessThanOrEqual(286);
  await expect(departmentPanel.locator("header")).toHaveCSS("border-bottom-width", "0px");
  const firstDepartment = departmentPanel.locator(".department-node").first();
  await expect(firstDepartment).toHaveCSS("height", "38px");
  await expect(firstDepartment.locator(".tree-chevron")).toHaveCSS("width", "18px");
  await expect(firstDepartment.locator(".department-name")).toHaveCSS("column-gap", "6px");
  await expect(firstDepartment.locator(".department-name svg")).toHaveCSS("width", "16px");
  await expect(firstDepartment.locator(".department-name b")).toHaveText(/\d+/);
  const nameWidthBeforeHover = await firstDepartment.locator(".department-name").evaluate(
    (element) => element.getBoundingClientRect().width,
  );
  await firstDepartment.hover();
  await expect(firstDepartment.locator(".department-tools svg").first()).toHaveCSS("width", "14px");
  const nameWidthAfterHover = await firstDepartment.locator(".department-name").evaluate(
    (element) => element.getBoundingClientRect().width,
  );
  expect(nameWidthAfterHover).toBe(nameWidthBeforeHover);

  await expect(page.getByRole("columnheader", { name: "序号" })).toBeVisible();
  await expect(page.locator(".people-table tbody tr").first().locator("td").first()).toHaveText("1");
  await expect(page.getByLabel("搜索人员姓名或账号")).toBeVisible();
  await expect(page.locator(".topnav-tool")).toHaveCount(0);

  await page.getByRole("button", { name: "新增人员" }).click();
  let modal = page.getByRole("dialog");
  await expect(modal.getByRole("heading", { name: "新增人员" })).toBeVisible();
  await modal.getByLabel("人员姓名").fill("赵敏");
  await modal.getByLabel("登录账号").fill("zhaomin");
  await modal.getByLabel("个人存储阈值").fill("256");
  await modal.getByRole("button", { name: "保存" }).click();

  modal = page.getByRole("dialog");
  await expect(modal.getByRole("heading", { name: "人员创建成功" })).toBeVisible();
  await expect(modal.getByText("zhaomin", { exact: true })).toBeVisible();
  await expect(modal.getByText("24 小时内有效", { exact: false })).toBeVisible();
  const temporaryPassword = await modal.locator("code").innerText();
  expect(temporaryPassword.length).toBeGreaterThanOrEqual(10);
  await modal.getByRole("button", { name: "复制完整人员信息" }).click();
  await expect(modal.getByRole("button", { name: "人员信息已复制" })).toBeVisible();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toContain("人员姓名：赵敏");
  expect(copied).toContain("登录账号：zhaomin");
  expect(copied).toContain(`临时密码：${temporaryPassword}`);
  await modal.getByRole("button", { name: "我已记录" }).click();

  await page.getByLabel("搜索人员姓名或账号").fill("zhaomin");
  const row = page.getByRole("row").filter({ hasText: "赵敏" });
  await expect(row).toBeVisible();
  await row.getByTitle("人员设置").click();
  modal = page.getByRole("dialog");
  await expect(modal.getByLabel("人员姓名")).toHaveValue("赵敏");
  await expect(modal.getByLabel("登录账号")).toHaveValue("zhaomin");
  await expect(modal.getByLabel("登录账号")).toBeDisabled();
  await expect(modal.getByText("所属部门", { exact: true })).toBeVisible();
  await expect(modal.getByText("角色", { exact: true })).toBeVisible();
  await expect(modal.getByText("账号状态", { exact: true })).toBeVisible();
  await modal.getByRole("button", { name: "取消" }).click();

  await page.locator(".department-panel").getByTitle("新增一级部门").click();
  modal = page.getByRole("dialog");
  await expect(modal.getByRole("heading", { name: "新增部门" })).toBeVisible();
  await expect(modal.getByText("人员姓名", { exact: true })).toHaveCount(0);
  await expect(modal.getByText("部门名称", { exact: true })).toBeVisible();
});

test("邀请码注册成功且普通管理员不能越权管理其他部门", async ({ page }) => {
  await page.goto("/register");
  const captchaResponse = await page.request.get(`/api/auth/captcha?e2e=${Date.now()}`);
  expect(captchaResponse.ok()).toBeTruthy();
  const captchaSvg = await captchaResponse.text();
  const captcha = [...captchaSvg.matchAll(/<text[^>]*>([^<])<\/text>/g)]
    .map((match) => match[1])
    .join("");
  expect(captcha).toHaveLength(4);

  await page.getByLabel("账号").fill("wangyan");
  await page.getByLabel("姓名").fill("王妍");
  await page.getByRole("combobox").click();
  await page.getByRole("button", { name: "协作产品组", exact: true }).click();
  await page.getByLabel("密码", { exact: true }).fill("Register@2026");
  await page.getByLabel("确认密码").fill("Register@2026");
  await page.getByLabel("图形验证码").fill(captcha);
  await page.getByLabel("邀请码").fill("DEMO-8Q4K-2M7P");
  await page.getByRole("button", { name: "注册并登录" }).click();
  await expect(page).toHaveURL(/\/projects$/);
  const prototypeNavigation = page.locator(".sidenav");
  await expect(prototypeNavigation.getByRole("link", { name: "我的原型" })).toBeVisible();
  await expect(prototypeNavigation.getByRole("link", { name: "部门原型" })).toHaveCount(0);
  await expect(prototypeNavigation.getByRole("link", { name: "公开广场" })).toBeVisible();

  await logout(page);
  await login(page, "designer01", "Prototype@123");
  await expect(page).toHaveURL(/\/projects$/);
  const denied = await page.request.patch("/api/admin/users/user-product", {
    data: { storageQuotaBytes: 512 * 1024 * 1024 },
  });
  expect(denied.status()).toBe(404);
  expect((await denied.json()).message).toContain("超出管理范围");
});

test("邀请码默认十分钟并支持自定义有效期", async ({ page }) => {
  await login(page);
  await page.locator(".sidenav").getByRole("link", { name: "邀请码" }).click();
  await expect(page).toHaveURL(/\/admin\/invitations$/);

  const durationSelect = page.locator(".expiry-select").getByRole("combobox");
  await expect(durationSelect).toContainText("10 分钟");
  await durationSelect.click();
  await page.getByRole("option", { name: "自定义", exact: true }).click();
  await page.getByLabel("自定义有效期").fill("17");

  const responsePromise = page.waitForResponse((response) =>
    response.url().endsWith("/api/admin/invitations")
    && response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "生成邀请码" }).click();
  const response = await responsePromise;
  expect(response.ok()).toBeTruthy();
  const body = await response.json();
  expect(Date.parse(body.invitation.expiresAt) - Date.parse(body.invitation.createdAt)).toBe(17 * 60_000);
  await expect(page.getByRole("row").filter({ hasText: body.invitation.code })).toContainText("待使用");
});

test("访问量只按原型首页访问次数计数，预览生成请求不计数", async ({ page }) => {
  await login(page);
  const projectCard = page.locator(".prototype-card").filter({ hasText: "客户协作工作台" });
  const initialCount = Number(await projectCard.locator(".prototype-preview i").innerText());

  const previewCapture = await page.request.get("/project/qu3FeXz5/", {
    headers: { "x-prototype-preview-capture": "1" },
  });
  expect(previewCapture.ok()).toBeTruthy();
  expect((await page.request.get("/project/qu3FeXz5/")).ok()).toBeTruthy();
  expect((await page.request.get("/project/qu3FeXz5/")).ok()).toBeTruthy();

  await page.reload();
  await page.locator('[data-proto-app][data-hydrated="true"]').waitFor();
  await expect(page.locator(".prototype-card").filter({ hasText: "客户协作工作台" }).locator(".prototype-preview i"))
    .toHaveText(String(initialCount + 2));
});

test("业务分类支持行内新增、重命名和上下移动", async ({ page }) => {
  await login(page);
  await page.goto("/admin/categories");
  await page.locator('[data-proto-app][data-hydrated="true"]').waitFor();

  await page.getByRole("button", { name: "新增分类" }).click();
  const draftRow = page.getByRole("row").filter({ has: page.getByLabel("分类名称") });
  await expect(draftRow).toBeVisible();
  await draftRow.getByRole("button", { name: "保存" }).click();
  await expect(page.getByText("请输入分类名称")).toBeVisible();
  await draftRow.getByLabel("分类名称").fill("客户服务");
  await draftRow.getByRole("button", { name: "保存" }).click();
  await expect(page.getByRole("row").filter({ hasText: "客户服务" })).toBeVisible();
  await expect(page.getByRole("status")).toContainText("分类已新增");
  await expect(page.getByRole("columnheader", { name: "序号" })).toBeVisible();

  const beforeMove = await page.locator(".category-table tbody tr").allTextContents();
  expect(beforeMove.at(-1)).toContain("客户服务");
  const moveResponse = page.waitForResponse((response) =>
    response.url().includes("/api/admin/categories/")
    && response.request().method() === "PATCH"
    && response.request().postDataJSON()?.move === "up",
  );
  await page.getByTitle("上移 客户服务").click();
  expect((await moveResponse).ok()).toBeTruthy();
  await expect(page.getByRole("status")).toContainText("分类排序已更新");
  await expect.poll(async () => (await page.locator(".category-table tbody tr").allTextContents()).at(-2))
    .toContain("客户服务");

  const categoryRow = page.getByRole("row").filter({ hasText: "客户服务" });
  await categoryRow.getByTitle("编辑 客户服务").click();
  await page.getByLabel("分类名称").fill("客户服务");
  await page.getByRole("row").filter({ has: page.getByLabel("分类名称") }).getByRole("button", { name: "保存" }).click();
  await page.reload();
  await page.locator('[data-proto-app][data-hydrated="true"]').waitFor();
  const persisted = await page.locator(".category-table tbody tr").allTextContents();
  expect(persisted.at(-2)).toContain("客户服务");
});

test("公开广场业务分类自动换行且不产生横向滚动", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  await page.goto("/square");
  await page.locator('[data-proto-app][data-hydrated="true"]').waitFor();
  const tabs = page.locator(".category-tabs");
  const metrics = await tabs.evaluate((node) => ({
    flexWrap: getComputedStyle(node).flexWrap,
    overflowX: getComputedStyle(node).overflowX,
    clientWidth: node.clientWidth,
    scrollWidth: node.scrollWidth,
  }));
  expect(metrics.flexWrap).toBe("wrap");
  expect(metrics.overflowX).not.toBe("auto");
  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth + 1);
});

test("390px 移动视口下导航、内容和用户菜单不横向溢出", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/login");
  await expect(page.locator(".auth-form-desc")).toHaveText("登录后进入原型工作区");
  await login(page);
  await expect(page).toHaveURL(/\/projects$/);

  const projectMetrics = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(projectMetrics.scrollWidth).toBeLessThanOrEqual(projectMetrics.clientWidth + 1);
  await expect(page.locator(".sidenav")).toHaveCSS("position", "fixed");
  await expect(page.locator(".mobile-nav-trigger")).toBeVisible();

  await page.locator(".topnav-user").click();
  const menuBox = await page.getByRole("menu").boundingBox();
  expect(menuBox).not.toBeNull();
  expect(menuBox!.x).toBeGreaterThanOrEqual(0);
  expect(menuBox!.x + menuBox!.width).toBeLessThanOrEqual(390);

  await page.keyboard.press("Escape");
  await page.locator(".mobile-nav-trigger").click();
  await expect(page.locator(".app-frame")).toHaveClass(/is-mobile-nav-open/);
  const mobileSideNav = page.locator(".sidenav");
  await expect(mobileSideNav).toHaveCSS("transform", "matrix(1, 0, 0, 1, 0, 0)");
  const sideNavBox = await mobileSideNav.boundingBox();
  expect(sideNavBox).not.toBeNull();
  expect(sideNavBox!.x).toBeGreaterThanOrEqual(0);
  expect(sideNavBox!.width).toBeGreaterThanOrEqual(250);
  await mobileSideNav.getByRole("link", { name: "部门人员" }).click();
  await expect(page).toHaveURL(/\/admin\/organization$/);
  const adminMetrics = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(adminMetrics.scrollWidth).toBeLessThanOrEqual(adminMetrics.clientWidth + 1);
});
