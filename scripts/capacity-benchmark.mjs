import { createHmac } from "node:crypto";
import { readFile, rm } from "node:fs/promises";
import path from "node:path";
import pg from "pg";

const { Pool } = pg;
const INTERNAL_BASE_URL = process.env.BENCHMARK_BASE_URL ?? "http://127.0.0.1:3000/manage";
const ORIGIN = new URL(process.env.MANAGE_URL ?? "https://prototype-demo.example.com").origin;
const TEST_PASSWORD = "CapacityTest@2026";
const TEST_PASSWORD_HASH = "$2b$10$pd8SbpO9drFEsOBxEnDYAezbvaltnx/RQTwYjZCVybHMvhTP9CNqC";
const RUN_ID = new Date().toISOString().replace(/\D/g, "").slice(0, 14);
const TEST_ACCOUNT = `capacity_${RUN_ID}`;
const TEST_NAME = `容量测试_${RUN_ID}`;
const DATA_ROOT = path.resolve(process.env.DATA_DIR ?? "/data/prototype-hub");
const QUICK_MODE = process.env.BENCHMARK_QUICK === "1";
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 3 });

const createdProjectIds = new Set();
let testUserId = null;
let sessionCookie = "";

function base64urlJson(value) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function createSessionToken(userId, sessionVersion) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64urlJson({ alg: "HS256" });
  const payload = base64urlJson({
    type: "session",
    sessionVersion,
    sub: userId,
    iat: now,
    exp: now + 12 * 60 * 60,
  });
  const signature = createHmac("sha256", process.env.SESSION_SIGNING_SECRET)
    .update(`${header}.${payload}`)
    .digest("base64url");
  return `${header}.${payload}.${signature}`;
}

async function query(text, values = []) {
  return pool.query(text, values);
}

async function readCgroupNumber(file) {
  try {
    return Number((await readFile(file, "utf8")).trim());
  } catch {
    return 0;
  }
}

async function readCpuUsec() {
  try {
    const stat = await readFile("/sys/fs/cgroup/cpu.stat", "utf8");
    return Number(stat.match(/^usage_usec\s+(\d+)$/m)?.[1] ?? 0);
  } catch {
    return 0;
  }
}

function percentile(values, ratio) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1)];
}

async function request(pathname, options = {}) {
  const headers = new Headers(options.headers);
  if (sessionCookie) headers.set("cookie", sessionCookie);
  if (options.method && options.method !== "GET") headers.set("origin", ORIGIN);
  const startedAt = performance.now();
  try {
    const response = await fetch(`${INTERNAL_BASE_URL}${pathname}`, {
      ...options,
      headers,
      redirect: "manual",
    });
    const body = await response.arrayBuffer();
    return {
      ok: response.ok,
      status: response.status,
      durationMs: performance.now() - startedAt,
      bytes: body.byteLength,
      body,
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      durationMs: performance.now() - startedAt,
      bytes: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function benchmark(label, concurrency, durationMs, operation) {
  const samples = [];
  const deadline = performance.now() + durationMs;
  const memorySamples = [];
  const cpuStart = await readCpuUsec();
  const wallStart = performance.now();
  const sampler = setInterval(async () => {
    memorySamples.push(await readCgroupNumber("/sys/fs/cgroup/memory.current"));
  }, 100);

  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (performance.now() < deadline) samples.push(await operation());
  }));

  clearInterval(sampler);
  memorySamples.push(await readCgroupNumber("/sys/fs/cgroup/memory.current"));
  const wallSeconds = (performance.now() - wallStart) / 1000;
  const cpuSeconds = ((await readCpuUsec()) - cpuStart) / 1_000_000;
  const successful = samples.filter((item) => item.ok);
  const failed = samples.filter((item) => !item.ok);
  const durations = samples.map((item) => item.durationMs);
  const statuses = Object.groupBy(failed, (item) => String(item.status));
  const result = {
    label,
    concurrency,
    requests: samples.length,
    errors: failed.length,
    errorRate: Number(((failed.length / Math.max(samples.length, 1)) * 100).toFixed(2)),
    requestsPerSecond: Number((samples.length / wallSeconds).toFixed(2)),
    megabytesPerSecond: Number((successful.reduce((sum, item) => sum + item.bytes, 0) / 1024 / 1024 / wallSeconds).toFixed(2)),
    averageMs: Number((durations.reduce((sum, item) => sum + item, 0) / Math.max(durations.length, 1)).toFixed(1)),
    p50Ms: Number(percentile(durations, 0.5).toFixed(1)),
    p95Ms: Number(percentile(durations, 0.95).toFixed(1)),
    p99Ms: Number(percentile(durations, 0.99).toFixed(1)),
    peakContainerMemoryMb: Number((Math.max(...memorySamples, 0) / 1024 / 1024).toFixed(1)),
    averageCpuCores: Number((cpuSeconds / wallSeconds).toFixed(2)),
    failedStatuses: Object.fromEntries(Object.entries(statuses).map(([status, items]) => [status, items.length])),
  };
  console.log(JSON.stringify({ type: "benchmark", ...result }));
  return result;
}

function testHtml(index, targetBytes = 1024 * 1024) {
  const head = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>容量测试${index}</title></head><body><h1>原型托管平台demo 容量测试 ${index}</h1><!--`;
  const tail = "--></body></html>";
  return `${head}${"x".repeat(Math.max(0, targetBytes - Buffer.byteLength(head) - Buffer.byteLength(tail)))}${tail}`;
}

async function uploadProject(index, targetBytes = 1024 * 1024) {
  const form = new FormData();
  form.set("name", `${TEST_NAME}_原型${index}`);
  form.set("file", new File([testHtml(index, targetBytes)], `${TEST_ACCOUNT}_${index}.html`, { type: "text/html" }));
  const result = await request("/api/projects", { method: "POST", body: form });
  if (result.ok) {
    const payload = JSON.parse(Buffer.from(result.body).toString("utf8"));
    createdProjectIds.add(payload.project.id);
    return { ...result, project: payload.project };
  }
  return result;
}

async function waitForPreviews(projectIds, timeoutMs = 45_000) {
  const startedAt = performance.now();
  let statuses = [];
  while (performance.now() - startedAt < timeoutMs) {
    const result = await query(
      "select id, preview_status, preview_size, preview_error from projects where id = any($1::uuid[]) order by created_at",
      [projectIds],
    );
    statuses = result.rows;
    if (statuses.length === projectIds.length && statuses.every((item) => item.preview_status !== "pending")) break;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return { durationMs: Math.round(performance.now() - startedAt), statuses };
}

async function databaseSnapshot() {
  const result = await query(`
    select
      pg_database_size(current_database())::bigint as database_bytes,
      (select count(*) from users)::bigint as users,
      (select count(*) from projects)::bigint as projects,
      (select count(*) from project_visits)::bigint as visits,
      (select count(*) from login_logs)::bigint as login_logs,
      coalesce((select sum(file_size + preview_size) from projects), 0)::bigint as project_bytes
  `);
  return Object.fromEntries(Object.entries(result.rows[0]).map(([key, value]) => [key, Number(value)]));
}

async function cleanup() {
  if (!testUserId) return { skipped: true };
  const projects = await query(
    "select id, html_path, preview_path from projects where owner_id = $1",
    [testUserId],
  );
  await query("delete from platform_events where user_id = $1 or project_id = any($2::uuid[])", [
    testUserId,
    projects.rows.map((item) => item.id),
  ]);
  await query("delete from projects where owner_id = $1", [testUserId]);
  await query("delete from login_logs where account = $1 or user_id = $2", [TEST_ACCOUNT, testUserId]);
  await query("delete from users where id = $1", [testUserId]);

  for (const section of ["prototypes", "previews"]) {
    const target = path.resolve(DATA_ROOT, section, testUserId);
    const expectedParent = `${path.resolve(DATA_ROOT, section)}${path.sep}`;
    if (!target.startsWith(expectedParent)) throw new Error(`拒绝清理非测试目录：${target}`);
    await rm(target, { recursive: true, force: true });
  }

  const verification = await query(
    `select
       (select count(*) from users where id = $1)::int as users,
       (select count(*) from projects where owner_id = $1)::int as projects,
       (select count(*) from login_logs where account = $2)::int as login_logs,
       (select count(*) from platform_events where user_id = $1)::int as platform_events`,
    [testUserId, TEST_ACCOUNT],
  );
  return verification.rows[0];
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("缺少 DATABASE_URL");
  if (!process.env.SESSION_SIGNING_SECRET || process.env.SESSION_SIGNING_SECRET.length < 32) {
    throw new Error("缺少有效的 SESSION_SIGNING_SECRET");
  }

  console.log(JSON.stringify({ type: "run", runId: RUN_ID, account: TEST_ACCOUNT, baseUrl: INTERNAL_BASE_URL }));
  console.log(JSON.stringify({ type: "database_before", ...(await databaseSnapshot()) }));

  const department = await query("select id, name from departments order by created_at limit 1");
  if (!department.rows[0]) throw new Error("系统中没有可用于测试的部门");
  const created = await query(
    `insert into users (account, password_hash, name, department_id, storage_quota_bytes)
     values ($1, $2, $3, $4, $5) returning id, session_version`,
    [TEST_ACCOUNT, TEST_PASSWORD_HASH, TEST_NAME, department.rows[0].id, 512 * 1024 * 1024],
  );
  testUserId = String(created.rows[0].id);
  sessionCookie = `prototype_session=${createSessionToken(testUserId, Number(created.rows[0].session_version))}`;

  const initialUpload = await uploadProject(0);
  if (!initialUpload.ok) {
    throw new Error(`初始测试原型上传失败，HTTP ${initialUpload.status}：${Buffer.from(initialUpload.body ?? []).toString("utf8")}`);
  }
  const project = initialUpload.project;
  const initialPreview = await waitForPreviews([project.id]);
  console.log(JSON.stringify({ type: "initial_upload", uploadMs: Math.round(initialUpload.durationMs), preview: initialPreview }));

  if (QUICK_MODE) {
    console.log(JSON.stringify({ type: "quick_smoke", ok: true }));
    return;
  }

  const results = [];
  for (const concurrency of [1, 5, 10, 20, 30]) {
    results.push(await benchmark("登录", concurrency, 3_000, () => request("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json", origin: ORIGIN },
      body: JSON.stringify({ account: TEST_ACCOUNT, password: TEST_PASSWORD }),
    })));
  }
  for (const concurrency of [5, 10, 20, 30]) {
    results.push(await benchmark("我的原型列表", concurrency, 3_000, () => request("/projects")));
  }
  for (const concurrency of [5, 10, 20, 30]) {
    results.push(await benchmark("原型浏览并计数", concurrency, 3_000, () => request(`/project/${project.publicCode}/`)));
  }
  for (const concurrency of [5, 10, 20]) {
    results.push(await benchmark("1MB 原型下载", concurrency, 3_000, () => request(`/api/projects/${project.id}/download`)));
  }

  const uploadStartedAt = performance.now();
  const uploads = await Promise.all(Array.from({ length: 5 }, (_, index) => uploadProject(index + 1)));
  const successfulUploads = uploads.filter((item) => item.ok && item.project);
  const uploadIds = successfulUploads.map((item) => item.project.id);
  const previewResult = await waitForPreviews(uploadIds);
  console.log(JSON.stringify({
    type: "concurrent_uploads",
    concurrency: 5,
    successful: successfulUploads.length,
    failed: uploads.length - successfulUploads.length,
    responseTotalMs: Math.round(Math.max(...uploads.map((item) => item.durationMs), 0)),
    endToEndMs: Math.round(performance.now() - uploadStartedAt),
    previewResult,
  }));

  const visitCount = await query("select visit_count from projects where id = $1", [project.id]);
  console.log(JSON.stringify({ type: "visit_count", value: Number(visitCount.rows[0]?.visit_count ?? 0) }));
  console.log(JSON.stringify({ type: "database_after_test", ...(await databaseSnapshot()) }));
  console.log(JSON.stringify({ type: "summary", results }));
}

let failure = null;
try {
  await main();
} catch (error) {
  failure = error;
  console.error(JSON.stringify({ type: "error", message: error instanceof Error ? error.stack : String(error) }));
} finally {
  try {
    console.log(JSON.stringify({ type: "cleanup", ...(await cleanup()) }));
    console.log(JSON.stringify({ type: "database_after_cleanup", ...(await databaseSnapshot()) }));
  } catch (error) {
    failure ??= error;
    console.error(JSON.stringify({ type: "cleanup_error", message: error instanceof Error ? error.stack : String(error) }));
  }
  await pool.end();
}

if (failure) process.exitCode = 1;
