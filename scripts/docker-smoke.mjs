import { readFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import pg from "pg";
import { compare } from "bcryptjs";
import JSZip from "jszip";

const baseUrl = (process.env.SMOKE_BASE_URL ?? "http://127.0.0.1:3310/manage").replace(/\/$/, "");
const manageOrigin = process.env.SMOKE_MANAGE_ORIGIN ?? "https://prototype-demo.example.com";
const databaseUrl = process.env.SMOKE_DATABASE_URL
  ?? "postgresql://prototype_demo:DockerSmokeDb%402026@127.0.0.1:55432/prototype_demo";
const adminAccount = process.env.SMOKE_ADMIN_ACCOUNT ?? "admin";
const adminPassword = process.env.SMOKE_ADMIN_PASSWORD ?? "DockerAdmin@2026";
const largeHtmlBytes = 21 * 1024 * 1024;
const runId = Date.now().toString(36);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function expectStatus(response, status, label) {
  if (response.status !== status) {
    throw new Error(`${label}失败：HTTP ${response.status} ${(await response.text()).slice(0, 500)}`);
  }
  return response;
}

class HttpClient {
  cookies = new Map();

  async request(urlPath, options = {}) {
    const headers = new Headers(options.headers);
    if (this.cookies.size) {
      headers.set("cookie", [...this.cookies].map(([name, value]) => `${name}=${value}`).join("; "));
    }
    if (options.json !== undefined) {
      headers.set("content-type", "application/json");
    }
    if ((options.method ?? "GET") !== "GET" && options.origin !== false) {
      headers.set("origin", manageOrigin);
    }
    const response = await fetch(`${baseUrl}${urlPath}`, {
      ...options,
      headers,
      body: options.json === undefined ? options.body : JSON.stringify(options.json),
    });
    for (const value of response.headers.getSetCookie()) {
      const pair = value.split(";", 1)[0];
      const separator = pair.indexOf("=");
      const name = pair.slice(0, separator);
      const cookieValue = pair.slice(separator + 1);
      if (cookieValue) this.cookies.set(name, cookieValue);
      else this.cookies.delete(name);
    }
    return response;
  }
}

async function login(client, account, password) {
  return client.request("/api/auth/login", {
    method: "POST",
    json: { account, password },
  });
}

async function getCaptcha(client) {
  const response = await expectStatus(
    await client.request(`/api/auth/captcha?smoke=${Date.now()}-${Math.random()}`),
    200,
    "验证码获取",
  );
  const svg = await response.text();
  const answer = [...svg.matchAll(/<text[^>]*>([^<])<\/text>/g)].map((match) => match[1]).join("");
  assert(answer.length === 4, "验证码 SVG 无法解析");
  return answer;
}

async function createInvitation(admin, expiresInMinutes) {
  const response = await expectStatus(await admin.request("/api/admin/invitations", {
    method: "POST",
    json: expiresInMinutes === undefined ? {} : { expiresInMinutes },
  }), 200, "邀请码生成");
  return (await response.json()).invitation;
}

async function register(client, { account, name, departmentId, invitationCode, captcha }) {
  return client.request("/api/auth/register", {
    method: "POST",
    json: {
      account,
      name,
      departmentId,
      password: "Register@2026",
      confirmPassword: "Register@2026",
      invitationCode,
      captcha,
    },
  });
}

function htmlFileAtSize(size, name, marker = "Docker 截图验证") {
  const prefix = `<!doctype html><html lang="zh-CN"><body><h1>${marker}</h1>`;
  const suffix = "</body></html>";
  const padding = new Uint8Array(size - Buffer.byteLength(prefix) - Buffer.byteLength(suffix));
  padding.fill(32);
  return new File([prefix, padding, suffix], name, { type: "text/html" });
}

async function upload(client, file, name = "") {
  const form = new FormData();
  form.set("file", file);
  if (name) form.set("name", name);
  return client.request("/api/projects", { method: "POST", body: form });
}

async function waitForPreview(client, projectId) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const response = await expectStatus(
      await client.request(`/api/projects/${projectId}/preview`),
      200,
      "预览状态查询",
    );
    const body = await response.json();
    if (body.preview.status === "ready") return body.preview;
    if (body.preview.status === "failed") throw new Error(`预览生成失败：${body.preview.error}`);
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("预览生成超时");
}

async function previewHash(client, url) {
  const basePath = new URL(baseUrl).pathname.replace(/\/$/, "");
  const requestPath = url.startsWith(`${basePath}/`) ? url.slice(basePath.length) : url;
  const response = await expectStatus(await client.request(requestPath), 200, "预览图片读取");
  return createHash("sha256").update(Buffer.from(await response.arrayBuffer())).digest("hex");
}

const pool = new pg.Pool({ connectionString: databaseUrl, max: 4 });
const admin = new HttpClient();
const invitationIds = [];
let rarProjectId = null;
let largeProjectId = null;
let manyFilesProjectId = null;
let rootGroupId = null;
let categoryId = null;

try {
  await expectStatus(await fetch(`${baseUrl}/api/health`), 200, "Docker 健康检查");
  await expectStatus(await new HttpClient().request("/api/auth/login", {
    method: "POST",
    origin: false,
    json: { account: adminAccount, password: adminPassword },
  }), 403, "生产来源保护");
  await expectStatus(await login(admin, adminAccount.toUpperCase(), adminPassword), 200, "超级管理员登录");

  const rootGroup = await expectStatus(await admin.request("/api/groups", {
    method: "POST",
    json: { name: `Docker一级分组-${runId}`, parentId: null },
  }), 200, "一级分组创建");
  rootGroupId = (await rootGroup.json()).group.id;
  await expectStatus(await admin.request(`/api/groups/${rootGroupId}`, {
    method: "PATCH",
    json: { name: `Docker一级分组已编辑-${runId}`, parentId: null },
  }), 200, "一级分组保留空父级编辑");

  const categoryName = `Docker-sort-${runId}`;
  const categoryCreate = await expectStatus(await admin.request("/api/admin/categories", {
    method: "POST",
    json: { name: categoryName },
  }), 200, "业务分类行内新增接口");
  const createdCategory = (await categoryCreate.json()).category;
  categoryId = createdCategory.id;
  const categoryBeforeMove = await pool.query(
    "select id from business_categories order by sort_order, name",
  );
  assert(categoryBeforeMove.rows.at(-1)?.id === categoryId, "新增业务分类未排在列表末尾");
  await expectStatus(await admin.request(`/api/admin/categories/${categoryId}`, {
    method: "PATCH",
    json: { move: "up" },
  }), 200, "业务分类上移");
  const categoryAfterMove = await pool.query(
    "select id from business_categories order by sort_order, name",
  );
  assert(categoryAfterMove.rows.at(-2)?.id === categoryId, "业务分类上移顺序未持久化");

  const department = await pool.query("select id from departments order by created_at limit 1");
  const departmentId = department.rows[0]?.id;
  assert(departmentId, "数据库缺少初始化部门");

  const createdAccount = `created_${runId}`;
  const createdResponse = await expectStatus(await admin.request("/api/admin/users", {
    method: "POST",
    json: {
      account: createdAccount,
      name: "创建流程验证用户",
      departmentId,
      role: "user",
      status: "active",
    },
  }), 201, "管理员创建人员");
  const createdBody = await createdResponse.json();
  assert(createdBody.user?.account === createdAccount, "创建人员返回账号错误");
  assert(createdBody.user?.mustChangePassword === true, "新人员未标记首次登录强制改密");
  assert(createdBody.tempPassword?.length >= 10, "创建人员未返回一次性临时密码");
  assert(Date.parse(createdBody.expiresAt) > Date.now() + 23 * 60 * 60 * 1000, "创建人员临时密码有效期不足 24 小时");
  const createdStored = await pool.query(
    "select password_hash, must_change_password, temp_password_expires_at, storage_quota_bytes from users where account = $1",
    [createdAccount],
  );
  assert(createdStored.rows[0]?.password_hash !== createdBody.tempPassword, "数据库错误存储了临时密码明文");
  assert(await compare(createdBody.tempPassword, createdStored.rows[0].password_hash), "临时密码 Hash 无法校验");
  assert(createdStored.rows[0].must_change_password === true, "数据库未保存强制改密状态");
  assert(Number(createdStored.rows[0].storage_quota_bytes) === 500 * 1024 * 1024, "管理员新建人员默认容量不是 500MB");
  const createdClient = new HttpClient();
  const createdLogin = await expectStatus(await login(createdClient, createdAccount, createdBody.tempPassword), 200, "新人员临时密码登录");
  assert((await createdLogin.json()).next === "/manage/change-password", "新人员首次登录未强制改密");

  const defaultInvitation = await createInvitation(admin);
  invitationIds.push(defaultInvitation.id);
  assert(
    Date.parse(defaultInvitation.expiresAt) - Date.parse(defaultInvitation.createdAt) === 10 * 60_000,
    "默认邀请码不是 10 分钟",
  );

  const expiredInvitation = await createInvitation(admin, 1);
  invitationIds.push(expiredInvitation.id);
  await pool.query("update invitation_codes set expires_at = now() - interval '1 second' where id = $1", [expiredInvitation.id]);
  const expiredClient = new HttpClient();
  const expiredCaptcha = await getCaptcha(expiredClient);
  const expiredRegister = await register(expiredClient, {
    account: `expired_${runId}`,
    name: "过期验证",
    departmentId,
    invitationCode: expiredInvitation.code,
    captcha: expiredCaptcha,
  });
  await expectStatus(expiredRegister, 400, "过期邀请码拦截");

  const rollbackInvitation = await createInvitation(admin);
  invitationIds.push(rollbackInvitation.id);
  const duplicateClient = new HttpClient();
  const duplicateCaptcha = await getCaptcha(duplicateClient);
  await expectStatus(await register(duplicateClient, {
    account: adminAccount,
    name: "重复账号",
    departmentId,
    invitationCode: rollbackInvitation.code,
    captcha: duplicateCaptcha,
  }), 409, "重复账号注册");
  const rollbackState = await pool.query("select used_at from invitation_codes where id = $1", [rollbackInvitation.id]);
  assert(rollbackState.rows[0]?.used_at === null, "注册失败错误消耗了邀请码");

  const concurrentInvitation = await createInvitation(admin);
  invitationIds.push(concurrentInvitation.id);
  const candidates = [new HttpClient(), new HttpClient()];
  const answers = await Promise.all(candidates.map((client) => getCaptcha(client)));
  const accounts = [`race_a_${runId}`, `race_b_${runId}`];
  const registrations = await Promise.all(candidates.map((client, index) => register(client, {
    account: accounts[index],
    name: `并发用户${index + 1}`,
    departmentId,
    invitationCode: concurrentInvitation.code,
    captcha: answers[index],
  })));
  assert(
    registrations.map((response) => response.status).sort().join(",") === "200,400",
    `并发注册结果异常：${registrations.map((response) => response.status).join(",")}`,
  );
  const winnerIndex = registrations.findIndex((response) => response.status === 200);
  const winner = candidates[winnerIndex];
  const winnerAccount = accounts[winnerIndex];
  const userResult = await pool.query("select id, storage_quota_bytes from users where account = $1", [winnerAccount]);
  const userId = userResult.rows[0]?.id;
  assert(userId, "并发注册成功用户未写入数据库");
  assert(Number(userResult.rows[0].storage_quota_bytes) === 500 * 1024 * 1024, "注册用户默认容量不是 500MB");

  const reset = await expectStatus(await admin.request(`/api/admin/users/${userId}/reset-password`, {
    method: "POST",
    json: { password: "TempReset@2026" },
  }), 200, "临时密码重置");
  const resetBody = await reset.json();
  assert(resetBody.tempPassword === "TempReset@2026", "自定义临时密码返回值错误");
  assert(Date.parse(resetBody.expiresAt) > Date.now() + 23 * 60 * 60 * 1000, "临时密码有效期不足 24 小时");
  await expectStatus(await winner.request("/api/groups", {
    method: "POST",
    json: { name: "旧会话不应生效" },
  }), 401, "重置密码后的旧会话失效");

  const tempClient = new HttpClient();
  const tempLogin = await expectStatus(await login(tempClient, winnerAccount, "TempReset@2026"), 200, "临时密码登录");
  assert((await tempLogin.json()).next === "/manage/change-password", "临时密码登录未强制改密");
  await expectStatus(await tempClient.request("/api/groups", {
    method: "POST",
    json: { name: "强制改密前不应创建" },
  }), 401, "强制改密保护");
  const changed = await expectStatus(await tempClient.request("/api/auth/change-password", {
    method: "POST",
    json: {
      currentPassword: "TempReset@2026",
      newPassword: "Changed@2026",
      confirmPassword: "Changed@2026",
    },
  }), 200, "用户修改密码");
  assert((await changed.json()).next === "/manage/projects", "修改密码后的跳转路径错误");
  await expectStatus(await login(new HttpClient(), winnerAccount, "TempReset@2026"), 401, "旧临时密码失效");

  await expectStatus(await admin.request(`/api/admin/users/${userId}`, {
    method: "PATCH",
    json: { name: "容量验证用户", storageQuotaBytes: 5 * 1024 * 1024 },
  }), 200, "人员名称及容量阈值修改");
  const profile = await pool.query("select name, storage_quota_bytes from users where id = $1", [userId]);
  assert(profile.rows[0].name === "容量验证用户", "人员名称未写入数据库");
  assert(Number(profile.rows[0].storage_quota_bytes) === 5 * 1024 * 1024, "人员容量阈值未写入数据库");

  const firstUpload = await expectStatus(await upload(tempClient, htmlFileAtSize(Math.floor(4.5 * 1024 * 1024), "容量原型.html")), 200, "阈值内上传");
  const firstProject = (await firstUpload.json()).project;
  assert(firstProject.name === "容量原型", "空名称未自动使用文件名");
  const htmlDownload = await expectStatus(
    await tempClient.request(`/api/projects/${firstProject.id}/download`),
    200,
    "普通用户下载自有 HTML 原型",
  );
  assert(
    htmlDownload.headers.get("content-disposition")?.includes(encodeURIComponent("容量原型.html")),
    "HTML 下载未保留上传文件名",
  );
  assert((await htmlDownload.text()).startsWith("<!doctype html>"), "HTML 下载内容不正确");
  const preview = await waitForPreview(tempClient, firstProject.id);
  assert(preview.url && preview.size > 1000, "Docker 内真实预览图未生成");
  const initialPreviewHash = await previewHash(tempClient, preview.url);

  const overQuota = await upload(tempClient, htmlFileAtSize(1024 * 1024, "超额原型.html"));
  await expectStatus(overQuota, 400, "个人容量阈值拦截");
  assert((await overQuota.json()).message.includes("存储"), "个人容量阈值错误提示不明确");

  const updateForm = new FormData();
  updateForm.set("file", htmlFileAtSize(
    Math.floor(4.7 * 1024 * 1024),
    "容量原型更新.html",
    "Docker 更新后截图验证",
  ));
  await expectStatus(await tempClient.request(`/api/projects/${firstProject.id}/file`, {
    method: "POST",
    body: updateForm,
  }), 200, "替换已有原型不重复占用容量");
  const updatedPreview = await waitForPreview(tempClient, firstProject.id);
  const updatedPreviewHash = await previewHash(tempClient, updatedPreview.url);
  assert(updatedPreviewHash !== initialPreviewHash, "更新原型后仍在使用旧预览图");
  await expectStatus(await tempClient.request(`/api/projects/${firstProject.id}`, { method: "DELETE" }), 200, "更新后立即删除");

  const largeUpload = await expectStatus(
    await upload(admin, htmlFileAtSize(largeHtmlBytes, "大文件原型.html")),
    200,
    "超过旧限制的大文件上传",
  );
  const largeProject = (await largeUpload.json()).project;
  largeProjectId = largeProject.id;
  assert(Number(largeProject.fileSize) === largeHtmlBytes, "大文件实际大小记录不正确");
  await expectStatus(
    await admin.request(`/api/projects/${largeProject.id}`, { method: "DELETE" }),
    200,
    "大文件测试数据清理",
  );
  largeProjectId = null;

  const manyFilesZip = new JSZip();
  manyFilesZip.file("many/index.html", "<!doctype html><html><body>1100 files</body></html>");
  for (let index = 0; index < 1100; index += 1) {
    manyFilesZip.file(`many/assets/${index}.txt`, String(index));
  }
  const manyFilesArchive = await manyFilesZip.generateAsync({ type: "uint8array" });
  const manyFilesUpload = await expectStatus(
    await upload(admin, new File([manyFilesArchive], "Docker-1101-files.zip")),
    200,
    "超过 1000 个文件的 ZIP 上传",
  );
  const manyFilesProject = (await manyFilesUpload.json()).project;
  manyFilesProjectId = manyFilesProject.id;
  await expectStatus(
    await admin.request(`/project/${manyFilesProject.publicCode}/assets/1099.txt`),
    200,
    "超过 1000 个文件的末尾资源访问",
  );
  await expectStatus(
    await admin.request(`/api/projects/${manyFilesProject.id}`, { method: "DELETE" }),
    200,
    "多文件原型删除",
  );
  manyFilesProjectId = null;

  const previewEntryZip = new JSZip();
  previewEntryZip.file("preview-entry/preview.html", "<!doctype html><html><body>preview entry</body></html>");
  previewEntryZip.file("preview-entry/assets/app.js", "document.body.dataset.entry='preview'");
  const previewEntryArchive = await previewEntryZip.generateAsync({ type: "uint8array" });
  const previewEntryUpload = await expectStatus(
    await upload(admin, new File([previewEntryArchive], "Docker-preview-entry.zip")),
    200,
    "preview.html 入口 ZIP 上传",
  );
  const previewEntryProject = (await previewEntryUpload.json()).project;
  await expectStatus(
    await admin.request(`/project/${previewEntryProject.publicCode}/assets/app.js`),
    200,
    "preview.html 入口子资源访问",
  );
  await expectStatus(
    await admin.request(`/api/projects/${previewEntryProject.id}`, { method: "DELETE" }),
    200,
    "preview.html 入口原型删除",
  );

  const analytics = await expectStatus(
    await admin.request("/admin/analytics"),
    200,
    "平台存储预算页面",
  );
  const analyticsHtml = await analytics.text();
  assert(analyticsHtml.includes("服务器整盘"), "平台数据未展示服务器整盘容量口径");
  assert(analyticsHtml.includes("本机数据库备份"), "平台数据未展示本机数据库备份占用");

  const rar = await readFile(path.join(process.cwd(), "tests", "fixtures", "rar-project.rar"));
  const rarUpload = await expectStatus(await upload(admin, new File([rar], "Docker-RAR.rar")), 200, "Docker RAR 上传");
  const rarProject = (await rarUpload.json()).project;
  rarProjectId = rarProject.id;
  await expectStatus(
    await tempClient.request(`/api/projects/${rarProject.id}/download`),
    404,
    "普通用户下载他人部门原型权限拦截",
  );
  const rarDownload = await expectStatus(
    await admin.request(`/api/projects/${rarProject.id}/download`),
    200,
    "管理员下载部门 RAR 原型",
  );
  assert(rarDownload.headers.get("content-type")?.includes("application/zip"), "RAR 下载未转换为 ZIP");
  assert(
    rarDownload.headers.get("content-disposition")?.includes("Docker-RAR.zip"),
    "RAR 下载文件名未转换为 ZIP",
  );
  const downloadedZip = await JSZip.loadAsync(await rarDownload.arrayBuffer());
  assert(Boolean(downloadedZip.file("index.html")), "下载 ZIP 缺少 index.html");
  assert(Boolean(downloadedZip.file("assets/theme.css")), "下载 ZIP 缺少原型资源文件");
  await waitForPreview(admin, rarProject.id);
  const countAfterPreview = await pool.query("select visit_count from projects where id = $1", [rarProject.id]);
  assert(Number(countAfterPreview.rows[0].visit_count) === 0, "预览图生成错误计入了访问量");
  await expectStatus(await admin.request(`/project/${rarProject.publicCode}/`), 200, "原型首页首次访问计数");
  await expectStatus(await admin.request(`/project/${rarProject.publicCode}/`), 200, "原型首页再次访问计数");
  const rarAsset = await expectStatus(await admin.request(`/project/${rarProject.publicCode}/assets/theme.css`), 200, "RAR 子资源访问");
  assert((await rarAsset.text()).includes("rgb(18, 52, 86)"), "RAR 子资源内容不正确");
  const countAfterVisits = await pool.query("select visit_count from projects where id = $1", [rarProject.id]);
  assert(Number(countAfterVisits.rows[0].visit_count) === 2, "访问量未按原型首页访问次数计数");
  await expectStatus(await admin.request(`/api/projects/${rarProject.id}`, { method: "DELETE" }), 200, "RAR 原型删除");
  rarProjectId = null;

  const deleteRaceUpload = await expectStatus(await upload(tempClient, new File([
    "<!doctype html><html><body><h1>删除用户竞态</h1></body></html>",
  ], "删除用户竞态.html")), 200, "删除用户竞态上传");
  const deleteRaceProject = (await deleteRaceUpload.json()).project;
  await expectStatus(await admin.request(`/api/admin/users/${userId}`, { method: "DELETE" }), 200, "预览生成期间删除用户");
  await new Promise((resolve) => setTimeout(resolve, 2500));
  const raceState = await pool.query(
    "select (select count(*) from users where id = $1)::int as users, (select count(*) from projects where id = $2)::int as projects",
    [userId, deleteRaceProject.id],
  );
  assert(raceState.rows[0].users === 0 && raceState.rows[0].projects === 0, "删除用户后数据库仍有残留");

  console.log("Docker 深度冒烟通过：basePath、来源保护、人员创建、邀请码并发/过期/回滚、注册登录、临时密码、改密、容量、一级分组编辑、1101 文件上传、大文件上传、HTML/RAR 下载、下载权限、截图及更新后换图、访问量、分类排序与删除竞态均正常");
} finally {
  if (largeProjectId) {
    await admin.request(`/api/projects/${largeProjectId}`, { method: "DELETE" }).catch(() => undefined);
  }
  if (rarProjectId) {
    await admin.request(`/api/projects/${rarProjectId}`, { method: "DELETE" }).catch(() => undefined);
  }
  if (manyFilesProjectId) {
    await admin.request(`/api/projects/${manyFilesProjectId}`, { method: "DELETE" }).catch(() => undefined);
  }
  if (rootGroupId) {
    await admin.request(`/api/groups/${rootGroupId}`, { method: "DELETE" }).catch(() => undefined);
  }
  await pool.query("delete from users where account like $1", [`%_${runId}`]).catch(() => undefined);
  if (invitationIds.length) {
    await pool.query("delete from invitation_codes where id = any($1::uuid[])", [invitationIds]).catch(() => undefined);
  }
  if (categoryId) {
    await pool.query("delete from business_categories where id = $1", [categoryId]).catch(() => undefined);
  }
  await pool.end().catch(() => undefined);
}
