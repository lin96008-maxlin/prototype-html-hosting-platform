import { expect, test, type APIRequestContext } from "@playwright/test";

async function login(
  request: APIRequestContext,
  account: string,
  password: string,
  returnTo?: string,
) {
  return request.post("/api/auth/login", {
    data: { account, password, returnTo },
  });
}

async function logout(request: APIRequestContext) {
  const response = await request.post("/api/auth/logout");
  expect(response.ok(), await response.text()).toBeTruthy();
}

async function captcha(request: APIRequestContext) {
  const response = await request.get(`/api/auth/captcha?test=${Date.now()}-${Math.random()}`);
  expect(response.ok(), await response.text()).toBeTruthy();
  const svg = await response.text();
  const answer = [...svg.matchAll(/<text[^>]*>([^<])<\/text>/g)]
    .map((match) => match[1])
    .join("");
  expect(answer).toHaveLength(4);
  return answer;
}

async function createInvitation(request: APIRequestContext, expiresInMinutes?: number) {
  const response = await request.post("/api/admin/invitations", {
    data: expiresInMinutes === undefined ? {} : { expiresInMinutes },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  return (await response.json()).invitation as {
    code: string;
    createdAt: string;
    expiresAt: string;
  };
}

async function register(
  request: APIRequestContext,
  input: {
    account: string;
    name: string;
    departmentId?: string;
    password?: string;
    confirmPassword?: string;
    captcha?: string;
    invitationCode: string;
  },
) {
  return request.post("/api/auth/register", {
    data: {
      departmentId: "dept-collaboration",
      password: "Register@2026",
      confirmPassword: "Register@2026",
      ...input,
    },
  });
}

test.beforeEach(async ({ request }) => {
  const response = await request.post("/api/test/reset");
  expect(response.ok()).toBeTruthy();
});

test("注册字段、验证码和部门校验会给出明确错误", async ({ request }) => {
  let response = await register(request, {
    account: "1bad",
    name: "测试用户",
    invitationCode: "DEMO-8Q4K-2M7P",
    captcha: "ABCD",
  });
  expect(response.status()).toBe(400);
  expect((await response.json()).message).toContain("账号须以字母开头");

  response = await register(request, {
    account: "validuser",
    name: "测试用户",
    confirmPassword: "Different@2026",
    invitationCode: "DEMO-8Q4K-2M7P",
    captcha: "ABCD",
  });
  expect(response.status()).toBe(400);
  expect((await response.json()).message).toContain("两次输入的密码不一致");

  response = await register(request, {
    account: "validuser",
    name: "测试用户",
    invitationCode: "DEMO-8Q4K-2M7P",
    captcha: "WRNG",
  });
  expect(response.status()).toBe(400);
  expect((await response.json()).message).toContain("验证码错误或已失效");

  const answer = await captcha(request);
  response = await register(request, {
    account: "validuser",
    name: "测试用户",
    departmentId: "missing-department",
    invitationCode: "DEMO-8Q4K-2M7P",
    captcha: answer,
  });
  expect(response.status()).toBe(400);
  expect((await response.json()).message).toContain("所选部门不存在");
});

test("邀请码只能使用一次，注册失败不会误消耗邀请码", async ({ request }) => {
  expect((await login(request, "admin", "Prototype@123")).ok()).toBeTruthy();
  const firstInvitation = await createInvitation(request);
  const rollbackInvitation = await createInvitation(request);
  await logout(request);

  let answer = await captcha(request);
  let response = await register(request, {
    account: "newusera",
    name: "新用户甲",
    invitationCode: firstInvitation.code.toLowerCase(),
    captcha: answer.toLowerCase(),
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  await logout(request);

  answer = await captcha(request);
  response = await register(request, {
    account: "newuserb",
    name: "新用户乙",
    invitationCode: firstInvitation.code,
    captcha: answer,
  });
  expect(response.status()).toBe(400);
  expect((await response.json()).message).toContain("邀请码无效、已使用或已过期");

  answer = await captcha(request);
  response = await register(request, {
    account: "admin",
    name: "重复账号",
    invitationCode: rollbackInvitation.code,
    captcha: answer,
  });
  expect(response.status()).toBe(409);
  expect((await response.json()).message).toContain("该账号已存在");

  answer = await captcha(request);
  response = await register(request, {
    account: "newuserc",
    name: "新用户丙",
    invitationCode: rollbackInvitation.code,
    captcha: answer,
  });
  expect(response.ok(), await response.text()).toBeTruthy();

  await logout(request);
  expect((await login(request, "admin", "Prototype@123")).ok()).toBeTruthy();
  const analytics = await request.get("/admin/analytics");
  const analyticsHtml = await analytics.text();
  expect(analytics.ok(), analyticsHtml).toBeTruthy();
  expect(analyticsHtml).toContain("新用户甲");
  expect(analyticsHtml).toContain("新用户丙");
});

test("邀请码默认十分钟、边界有效且普通管理员无权生成", async ({ request }) => {
  expect((await login(request, "admin", "Prototype@123")).ok()).toBeTruthy();
  const defaultInvitation = await createInvitation(request);
  expect(Date.parse(defaultInvitation.expiresAt) - Date.parse(defaultInvitation.createdAt)).toBe(10 * 60_000);
  const minimum = await createInvitation(request, 1);
  expect(Date.parse(minimum.expiresAt) - Date.parse(minimum.createdAt)).toBe(60_000);
  const maximum = await createInvitation(request, 1440);
  expect(Date.parse(maximum.expiresAt) - Date.parse(maximum.createdAt)).toBe(1440 * 60_000);

  for (const expiresInMinutes of [0, 1.5, 1441]) {
    const invalid = await request.post("/api/admin/invitations", { data: { expiresInMinutes } });
    expect(invalid.status()).toBe(400);
    expect((await invalid.json()).message).toContain("有效期设置无效");
  }

  await logout(request);
  expect((await login(request, "designer01", "Prototype@123")).ok()).toBeTruthy();
  const denied = await request.post("/api/admin/invitations", { data: { expiresInMinutes: 10 } });
  expect(denied.status()).toBe(403);
  expect((await denied.json()).message).toContain("仅超级管理员可生成邀请码");
});

test("登录大小写、回跳安全、错误限流和停用状态均生效", async ({ request }) => {
  let response = await login(request, "ADMIN", "Prototype@123", "https://evil.example/steal");
  expect(response.ok(), await response.text()).toBeTruthy();
  expect((await response.json()).next).toBe("/projects");
  await logout(request);

  for (let attempt = 0; attempt < 10; attempt += 1) {
    response = await login(request, "product01", "Wrong@2026");
    expect(response.status()).toBe(401);
  }
  response = await login(request, "product01", "Prototype@123");
  expect(response.status()).toBe(429);
  expect((await response.json()).message).toContain("15 分钟后再试");

  await request.post("/api/test/reset");
  expect((await login(request, "admin", "Prototype@123")).ok()).toBeTruthy();
  const disabled = await request.patch("/api/admin/users/user-data", {
    data: { status: "disabled" },
  });
  expect(disabled.ok(), await disabled.text()).toBeTruthy();
  await logout(request);
  response = await login(request, "data01", "Prototype@123");
  expect(response.status()).toBe(401);
  expect((await response.json()).message).toContain("账号或密码错误");
});

test("修改密码校验完整，旧密码在修改后立即失效", async ({ request }) => {
  expect((await login(request, "product01", "Prototype@123")).ok()).toBeTruthy();

  let response = await request.post("/api/auth/change-password", {
    data: { currentPassword: "Wrong@2026", newPassword: "NewPass@2026", confirmPassword: "NewPass@2026" },
  });
  expect(response.status()).toBe(400);
  expect((await response.json()).message).toContain("当前密码不正确");

  response = await request.post("/api/auth/change-password", {
    data: { currentPassword: "Prototype@123", newPassword: "NewPass@2026", confirmPassword: "Different@2026" },
  });
  expect(response.status()).toBe(400);
  expect((await response.json()).message).toContain("两次输入的新密码不一致");

  response = await request.post("/api/auth/change-password", {
    data: { currentPassword: "Prototype@123", newPassword: "Prototype@123", confirmPassword: "Prototype@123" },
  });
  expect(response.status()).toBe(400);
  expect((await response.json()).message).toContain("新密码不能与当前密码相同");

  response = await request.post("/api/auth/change-password", {
    data: { currentPassword: "Prototype@123", newPassword: "NewPass@2026", confirmPassword: "NewPass@2026" },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  await logout(request);
  expect((await login(request, "product01", "Prototype@123")).status()).toBe(401);
  expect((await login(request, "product01", "NewPass@2026")).ok()).toBeTruthy();
});

test("随机临时密码满足强度并默认二十四小时失效", async ({ request }) => {
  expect((await login(request, "admin", "Prototype@123")).ok()).toBeTruthy();
  const before = Date.now();
  const reset = await request.post("/api/admin/users/user-product/reset-password", { data: {} });
  expect(reset.ok(), await reset.text()).toBeTruthy();
  const body = await reset.json();
  expect(body.tempPassword).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789@#$%]{14}$/);
  expect(Date.parse(body.expiresAt)).toBeGreaterThanOrEqual(before + 24 * 60 * 60 * 1000 - 1000);
  expect(Date.parse(body.expiresAt)).toBeLessThanOrEqual(Date.now() + 24 * 60 * 60 * 1000 + 1000);
  await logout(request);

  const loginResponse = await login(request, "product01", body.tempPassword);
  expect(loginResponse.ok(), await loginResponse.text()).toBeTruthy();
  expect((await loginResponse.json()).next).toBe("/change-password");
  const protectedResponse = await request.post("/api/groups", { data: { name: "不应创建" } });
  expect(protectedResponse.status()).toBe(401);
});
