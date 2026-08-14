import { createHash, createHmac } from "node:crypto";
import { gzipSync } from "node:zlib";
import { readFile, rm } from "node:fs/promises";
import path from "node:path";
import pg from "pg";

const { Pool } = pg;
const BASE_URL = process.env.BENCHMARK_BASE_URL ?? "http://127.0.0.1:3000/manage";
const ORIGIN = new URL(process.env.MANAGE_URL ?? "https://prototype-demo.example.com").origin;
const FIXTURE_DIR = path.resolve(process.env.BENCHMARK_FIXTURE_DIR ?? "/app/benchmark-fixtures");
const DATA_ROOT = path.resolve(process.env.DATA_DIR ?? "/data/prototype-hub");
const DURATION_MS = Number(process.env.BENCHMARK_DURATION_MS ?? 3000);
const TEST_PASSWORD = "CapacityTest@2026";
const TEST_PASSWORD_HASH = "$2b$10$pd8SbpO9drFEsOBxEnDYAezbvaltnx/RQTwYjZCVybHMvhTP9CNqC";
const RUN_ID = new Date().toISOString().replace(/\D/g, "").slice(0, 14);
const TEST_ACCOUNT = `real_capacity_${RUN_ID}`;
const TEST_NAME = `Real capacity ${RUN_ID}`;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 3 });

const fixtureSpecs = [
  { key: "small", fileName: "small.html" },
  { key: "medium", fileName: "medium.html" },
  { key: "large", fileName: "large.html" },
];
const createdProjectIds = new Set();
let testUserId = null;
let sessionCookie = "";

function output(type, value = {}) {
  console.log(JSON.stringify({ type, ...value }));
}

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

function sha256(content) {
  return createHash("sha256").update(content).digest("hex");
}

function percentile(values, ratio) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1)];
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

async function readOomKills() {
  try {
    const events = await readFile("/sys/fs/cgroup/memory.events", "utf8");
    return Number(events.match(/^oom_kill\s+(\d+)$/m)?.[1] ?? 0);
  } catch {
    return 0;
  }
}

async function databaseConnections() {
  try {
    const result = await query(
      `select count(*)::int as total,
              count(*) filter (where state = 'active')::int as active
         from pg_stat_activity
        where datname = current_database()`,
    );
    return result.rows[0] ?? { total: 0, active: 0 };
  } catch {
    return { total: 0, active: 0 };
  }
}

async function request(pathname, options = {}) {
  const {
    authCookie = sessionCookie,
    captureBody = false,
    ...fetchOptions
  } = options;
  const headers = new Headers(fetchOptions.headers);
  if (authCookie) headers.set("cookie", authCookie);
  if (fetchOptions.method && fetchOptions.method !== "GET") headers.set("origin", ORIGIN);
  const startedAt = performance.now();
  try {
    const response = await fetch(`${BASE_URL}${pathname}`, {
      ...fetchOptions,
      headers,
      redirect: fetchOptions.redirect ?? "manual",
    });
    const body = new Uint8Array(await response.arrayBuffer());
    return {
      ok: response.ok,
      status: response.status,
      durationMs: performance.now() - startedAt,
      bytes: body.byteLength,
      headers: Object.fromEntries(response.headers.entries()),
      body: captureBody ? body : undefined,
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

async function benchmark(label, fixture, concurrency, operation) {
  const samples = [];
  const deadline = performance.now() + DURATION_MS;
  const memorySamples = [];
  const dbSamples = [];
  let sampling = false;
  const cpuStart = await readCpuUsec();
  const oomStart = await readOomKills();
  const wallStart = performance.now();
  const sampler = setInterval(async () => {
    if (sampling) return;
    sampling = true;
    try {
      memorySamples.push(await readCgroupNumber("/sys/fs/cgroup/memory.current"));
      dbSamples.push(await databaseConnections());
    } finally {
      sampling = false;
    }
  }, 150);

  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (performance.now() < deadline) samples.push(await operation());
  }));

  clearInterval(sampler);
  memorySamples.push(await readCgroupNumber("/sys/fs/cgroup/memory.current"));
  dbSamples.push(await databaseConnections());
  const wallSeconds = (performance.now() - wallStart) / 1000;
  const cpuSeconds = ((await readCpuUsec()) - cpuStart) / 1_000_000;
  const oomKills = (await readOomKills()) - oomStart;
  const successful = samples.filter((item) => item.ok);
  const failed = samples.filter((item) => !item.ok);
  const durations = samples.map((item) => item.durationMs);
  const statuses = Object.groupBy(failed, (item) => String(item.status));
  const result = {
    label,
    fixture,
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
    peakDbConnections: Math.max(...dbSamples.map((item) => Number(item.total)), 0),
    peakDbActive: Math.max(...dbSamples.map((item) => Number(item.active)), 0),
    oomKills,
    failedStatuses: Object.fromEntries(Object.entries(statuses).map(([status, items]) => [status, items.length])),
  };
  output("benchmark", result);
  return result;
}

async function loadFixtures() {
  const fixtures = [];
  for (const spec of fixtureSpecs) {
    const content = await readFile(path.join(FIXTURE_DIR, spec.fileName));
    const text = content.toString("utf8");
    if (!/<html[\s>]/i.test(text) || !/<body[\s>]/i.test(text)) {
      throw new Error(`Invalid HTML fixture: ${spec.fileName}`);
    }
    const gzipBytes = gzipSync(content, { level: 6 }).byteLength;
    fixtures.push({
      ...spec,
      content,
      bytes: content.byteLength,
      gzipBytes,
      sha256: sha256(content),
    });
  }
  output("fixtures", {
    values: fixtures.map((item) => ({
      key: item.key,
      fileName: item.fileName,
      bytes: item.bytes,
      gzipBytes: item.gzipBytes,
      sha256: item.sha256,
      megabytes: Number((item.bytes / 1024 / 1024).toFixed(3)),
      gzipMegabytes: Number((item.gzipBytes / 1024 / 1024).toFixed(3)),
      gzipRatioPercent: Number(((item.gzipBytes / item.bytes) * 100).toFixed(1)),
    })),
  });
  return fixtures;
}

async function uploadHtml(fixture, suffix = "primary") {
  const form = new FormData();
  form.set("name", `${fixture.key} ${suffix}`);
  form.set("file", new File([fixture.content], fixture.fileName, { type: "text/html" }));
  const result = await request("/api/projects", { method: "POST", body: form, captureBody: true });
  if (!result.ok) return result;
  const payload = JSON.parse(Buffer.from(result.body).toString("utf8"));
  createdProjectIds.add(payload.project.id);
  return { ...result, project: payload.project };
}

async function uploadFolder(fixture) {
  const form = new FormData();
  form.set("name", `${fixture.key} folder`);
  form.append("files", new File([fixture.content], "index.html", { type: "text/html" }));
  form.append("paths", `${fixture.key}-folder/index.html`);
  const result = await request("/api/projects", { method: "POST", body: form, captureBody: true });
  if (!result.ok) return result;
  const payload = JSON.parse(Buffer.from(result.body).toString("utf8"));
  createdProjectIds.add(payload.project.id);
  return { ...result, project: payload.project };
}

async function waitForPreviews(projectIds, timeoutMs = 180_000) {
  const startedAt = performance.now();
  const completedAfterMs = new Map();
  let statuses = [];
  while (performance.now() - startedAt < timeoutMs) {
    const result = await query(
      `select id, preview_status, preview_size, preview_error
         from projects
        where id = any($1::uuid[])
        order by created_at`,
      [projectIds],
    );
    statuses = result.rows;
    for (const item of statuses) {
      if (item.preview_status !== "pending" && !completedAfterMs.has(item.id)) {
        completedAfterMs.set(item.id, Math.round(performance.now() - startedAt));
      }
    }
    if (statuses.length === projectIds.length && statuses.every((item) => item.preview_status !== "pending")) break;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return {
    durationMs: Math.round(performance.now() - startedAt),
    statuses: statuses.map((item) => ({
      ...item,
      preview_size: Number(item.preview_size ?? 0),
      completedAfterMs: completedAfterMs.get(item.id) ?? null,
    })),
  };
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

async function verifyDownloads(projects, fixtures, folderProject) {
  for (const fixture of fixtures) {
    const project = projects[fixture.key];
    const response = await request(`/api/projects/${project.id}/download`, { captureBody: true });
    if (!response.ok || response.bytes !== fixture.bytes || sha256(response.body) !== fixture.sha256) {
      throw new Error(`HTML download mismatch: ${fixture.key}`);
    }
    output("download_check", {
      fixture: fixture.key,
      sourceKind: project.sourceKind,
      status: response.status,
      bytes: response.bytes,
      sha256: sha256(response.body),
      contentDisposition: response.headers["content-disposition"],
    });
  }

  const folderResponse = await request(`/api/projects/${folderProject.id}/download`, { captureBody: true });
  if (!folderResponse.ok) throw new Error(`Folder ZIP download failed: HTTP ${folderResponse.status}`);
  const zipSignature = Buffer.from(folderResponse.body.subarray(0, 4)).toString("hex");
  if (zipSignature !== "504b0304") throw new Error(`Invalid ZIP signature: ${zipSignature}`);
  if (folderResponse.headers["content-type"] !== "application/zip") {
    throw new Error(`Invalid ZIP content type: ${folderResponse.headers["content-type"]}`);
  }
  output("download_check", {
    fixture: "large-folder-zip",
    sourceKind: folderProject.sourceKind,
    status: folderResponse.status,
    bytes: folderResponse.bytes,
    zipSignature,
    contentDisposition: folderResponse.headers["content-disposition"],
  });
}

async function configureShares(projects) {
  for (const project of Object.values(projects)) {
    const response = await request(`/api/projects/${project.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ shareEnabled: true, sharePassword: "", shareExpiresAt: null }),
      captureBody: true,
    });
    if (!response.ok) throw new Error(`Share setup failed: HTTP ${response.status}`);
  }
}

async function verifyVisitCounting(project) {
  const before = await query("select visit_count from projects where id = $1", [project.id]);
  for (let index = 0; index < 10; index += 1) {
    const response = await request(`/share/${project.shareCode}/`, { authCookie: null });
    if (!response.ok) throw new Error(`Visit count probe failed: HTTP ${response.status}`);
  }
  const after = await query("select visit_count from projects where id = $1", [project.id]);
  const beforeValue = Number(before.rows[0]?.visit_count ?? 0);
  const afterValue = Number(after.rows[0]?.visit_count ?? 0);
  output("visit_count_check", { before: beforeValue, after: afterValue, expectedDelta: 10, actualDelta: afterValue - beforeValue });
  if (afterValue - beforeValue !== 10) throw new Error(`Visit count mismatch: expected 10, got ${afterValue - beforeValue}`);
}

async function cleanup() {
  if (!testUserId) return { skipped: true };
  const projects = await query("select id from projects where owner_id = $1", [testUserId]);
  const projectIds = projects.rows.map((item) => item.id);
  await query("delete from platform_events where user_id = $1 or project_id = any($2::uuid[])", [testUserId, projectIds]);
  await query("delete from projects where owner_id = $1", [testUserId]);
  await query("delete from login_logs where account = $1 or user_id = $2", [TEST_ACCOUNT, testUserId]);
  await query("delete from users where id = $1", [testUserId]);

  for (const section of ["prototypes", "previews"]) {
    const target = path.resolve(DATA_ROOT, section, testUserId);
    const expectedParent = `${path.resolve(DATA_ROOT, section)}${path.sep}`;
    if (!target.startsWith(expectedParent)) throw new Error(`Refusing to clean non-test path: ${target}`);
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
  if (!process.env.DATABASE_URL) throw new Error("Missing DATABASE_URL");
  if (!process.env.SESSION_SIGNING_SECRET || process.env.SESSION_SIGNING_SECRET.length < 32) {
    throw new Error("Missing valid SESSION_SIGNING_SECRET");
  }

  const fixtures = await loadFixtures();
  output("run", { runId: RUN_ID, account: TEST_ACCOUNT, baseUrl: BASE_URL, durationMs: DURATION_MS });
  output("database_before", await databaseSnapshot());

  const department = await query("select id, name from departments order by created_at limit 1");
  if (!department.rows[0]) throw new Error("No department available for benchmark user");
  const created = await query(
    `insert into users (account, password_hash, name, department_id, storage_quota_bytes)
     values ($1, $2, $3, $4, $5) returning id, session_version`,
    [TEST_ACCOUNT, TEST_PASSWORD_HASH, TEST_NAME, department.rows[0].id, 512 * 1024 * 1024],
  );
  testUserId = String(created.rows[0].id);
  sessionCookie = `prototype_session=${createSessionToken(testUserId, Number(created.rows[0].session_version))}`;

  const uploadStartedAt = performance.now();
  const uploadResponses = [];
  for (const fixture of fixtures) uploadResponses.push(await uploadHtml(fixture));
  const large = fixtures.find((item) => item.key === "large");
  const folderUpload = await uploadFolder(large);
  uploadResponses.push(folderUpload);
  if (uploadResponses.some((item) => !item.ok || !item.project)) {
    throw new Error(`Initial upload failed: ${uploadResponses.map((item) => item.status).join(",")}`);
  }
  const initialProjects = Object.fromEntries(fixtures.map((fixture, index) => [fixture.key, uploadResponses[index].project]));
  const folderProject = folderUpload.project;
  const initialPreview = await waitForPreviews(uploadResponses.map((item) => item.project.id));
  output("initial_uploads", {
    uploadResponseMs: uploadResponses.map((item, index) => ({
      fixture: index < fixtures.length ? fixtures[index].key : "large-folder",
      durationMs: Math.round(item.durationMs),
      status: item.status,
      sourceKind: item.project.sourceKind,
      fileSize: item.project.fileSize,
    })),
    totalEndToEndMs: Math.round(performance.now() - uploadStartedAt),
    preview: initialPreview,
  });

  await verifyDownloads(initialProjects, fixtures, folderProject);
  const anonymousDownload = await request(`/api/projects/${initialProjects.small.id}/download`, { authCookie: null });
  output("anonymous_download_check", { status: anonymousDownload.status, expectedStatus: 401 });
  if (anonymousDownload.status !== 401) throw new Error(`Anonymous download should be 401, got ${anonymousDownload.status}`);

  await configureShares(initialProjects);
  for (const project of Object.values(initialProjects)) {
    const shareResponse = await request(`/share/${project.shareCode}/`, { authCookie: null });
    if (!shareResponse.ok) throw new Error(`Anonymous share check failed: HTTP ${shareResponse.status}`);
  }
  await verifyVisitCounting(initialProjects.small);

  const results = [];
  for (const concurrency of [1, 5, 10, 20, 30]) {
    results.push(await benchmark("login", "n/a", concurrency, () => request("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ account: TEST_ACCOUNT, password: TEST_PASSWORD }),
    })));
  }
  for (const concurrency of [5, 10, 20, 30]) {
    results.push(await benchmark("project-list", "n/a", concurrency, () => request("/projects")));
  }
  for (const fixture of fixtures) {
    const project = initialProjects[fixture.key];
    for (const concurrency of [5, 10, 20]) {
      results.push(await benchmark("owner-view", fixture.key, concurrency, () => request(`/project/${project.publicCode}/`)));
    }
  }
  for (const fixture of fixtures) {
    const project = initialProjects[fixture.key];
    for (const concurrency of [1, 5, 10, 20, 30]) {
      results.push(await benchmark("anonymous-share-view", fixture.key, concurrency, () => request(`/share/${project.shareCode}/`, { authCookie: null })));
    }
  }
  for (const fixture of fixtures) {
    const project = initialProjects[fixture.key];
    for (const concurrency of [1, 5, 10, 20]) {
      results.push(await benchmark("html-download", fixture.key, concurrency, () => request(`/api/projects/${project.id}/download`)));
    }
  }
  for (const concurrency of [1, 5, 10]) {
    results.push(await benchmark("folder-zip-download", "large", concurrency, () => request(`/api/projects/${folderProject.id}/download`)));
  }

  const concurrentStartedAt = performance.now();
  const concurrentUploads = await Promise.all(fixtures.map((fixture) => uploadHtml(fixture, "concurrent")));
  const successfulConcurrent = concurrentUploads.filter((item) => item.ok && item.project);
  const concurrentPreview = await waitForPreviews(successfulConcurrent.map((item) => item.project.id));
  output("concurrent_real_uploads", {
    concurrency: fixtures.length,
    successful: successfulConcurrent.length,
    failed: concurrentUploads.length - successfulConcurrent.length,
    responseMs: concurrentUploads.map((item, index) => ({ fixture: fixtures[index].key, durationMs: Math.round(item.durationMs), status: item.status })),
    responseTotalMs: Math.round(Math.max(...concurrentUploads.map((item) => item.durationMs), 0)),
    endToEndMs: Math.round(performance.now() - concurrentStartedAt),
    preview: concurrentPreview,
  });

  output("database_after_test", await databaseSnapshot());
  output("summary", { results });
}

let failure = null;
try {
  await main();
} catch (error) {
  failure = error;
  console.error(JSON.stringify({ type: "error", message: error instanceof Error ? error.stack : String(error) }));
} finally {
  try {
    output("cleanup", await cleanup());
    output("database_after_cleanup", await databaseSnapshot());
  } catch (error) {
    failure ??= error;
    console.error(JSON.stringify({ type: "cleanup_error", message: error instanceof Error ? error.stack : String(error) }));
  }
  await pool.end();
}

if (failure) process.exitCode = 1;
