import type { PoolClient, QueryResultRow } from "pg";
import { readFile, statfs } from "node:fs/promises";
import path from "node:path";
import { query } from "@/lib/db";
import { demoStore } from "@/lib/demo-store";
import { env, isDemoMode } from "@/lib/env";
import { DEFAULT_USER_STORAGE_QUOTA_BYTES } from "@/lib/storage-quota";

const DEFAULT_STORAGE_RESERVE_RATIO = 0.2;

export interface PlatformStorageBudget {
  prototypeUsedBytes: number;
  prototypeDiskBytes: number;
  diskTotalBytes: number;
  diskUsedBytes: number;
  diskAvailableBytes: number;
  backupRepositoryBytes: number;
  systemAndOtherUsedBytes: number;
  reserveRatio: number;
  reserveBytes: number;
  safeCapacityBytes: number;
  uploadAvailableBytes: number;
  backupStatus: PlatformBackupStatus | null;
}

export interface PlatformBackupStatus {
  status: "success" | "running" | "failed" | "unknown";
  lastSuccessAt: string | null;
  snapshotId: string | null;
  lastRestoreVerificationStatus: "success" | "running" | "failed" | null;
  lastRestoreVerifiedAt: string | null;
}

export function calculatePlatformStorageBudget(
  prototypeUsedBytes: number,
  diskTotalBytes: number,
  diskAvailableBytes: number,
  reserveRatio = DEFAULT_STORAGE_RESERVE_RATIO,
  backupRepositoryBytes = 0,
  prototypeDiskBytes = prototypeUsedBytes,
  backupStatus: PlatformBackupStatus | null = null,
): PlatformStorageBudget {
  const reserveBytes = Math.floor(diskTotalBytes * reserveRatio);
  const uploadAvailableBytes = Math.max(0, diskAvailableBytes - reserveBytes);
  const diskUsedBytes = Math.max(0, diskTotalBytes - diskAvailableBytes);
  const normalizedBackupBytes = Math.max(0, backupRepositoryBytes);
  const normalizedPrototypeDiskBytes = Math.max(prototypeUsedBytes, prototypeDiskBytes);
  const systemAndOtherUsedBytes = Math.max(
    0,
    diskUsedBytes - normalizedPrototypeDiskBytes - normalizedBackupBytes,
  );
  return {
    prototypeUsedBytes,
    prototypeDiskBytes: normalizedPrototypeDiskBytes,
    diskTotalBytes,
    diskUsedBytes,
    diskAvailableBytes,
    backupRepositoryBytes: normalizedBackupBytes,
    systemAndOtherUsedBytes,
    reserveRatio,
    reserveBytes,
    safeCapacityBytes: prototypeUsedBytes + uploadAvailableBytes,
    uploadAvailableBytes,
    backupStatus,
  };
}

function nullableString(value: unknown) {
  return typeof value === "string" && value ? value : null;
}

async function getBackupStatus() {
  if (!env.backupStatusDir) return null;
  try {
    const raw = JSON.parse(
      await readFile(path.join(env.backupStatusDir, "backup-status.json"), "utf8"),
    ) as Record<string, unknown>;
    const status = ["success", "running", "failed"].includes(String(raw.status))
      ? raw.status as PlatformBackupStatus["status"]
      : "unknown";
    const restoreStatus = ["success", "running", "failed"].includes(
      String(raw.lastRestoreVerificationStatus),
    )
      ? raw.lastRestoreVerificationStatus as NonNullable<PlatformBackupStatus["lastRestoreVerificationStatus"]>
      : null;
    return {
      repositorySizeBytes: Number.isFinite(Number(raw.repositorySizeBytes))
        ? Math.max(0, Number(raw.repositorySizeBytes))
        : 0,
      prototypeVolumeBytes: Number.isFinite(Number(raw.prototypeVolumeBytes))
        ? Math.max(0, Number(raw.prototypeVolumeBytes))
        : 0,
      status: {
        status,
        lastSuccessAt: nullableString(raw.lastSuccessAt),
        snapshotId: nullableString(raw.snapshotId),
        lastRestoreVerificationStatus: restoreStatus,
        lastRestoreVerifiedAt: nullableString(raw.lastRestoreVerifiedAt),
      } satisfies PlatformBackupStatus,
    };
  } catch {
    return null;
  }
}

async function runQuery<T extends QueryResultRow>(
  client: PoolClient | undefined,
  sql: string,
  values: unknown[] = [],
) {
  return client ? client.query<T>(sql, values) : query<T>(sql, values);
}

export async function getStorageUsageBytes(ownerId?: string, client?: PoolClient) {
  if (isDemoMode) {
    return demoStore.projects
      .filter((project) => !ownerId || project.ownerId === ownerId)
      .reduce(
      (total, project) => total + project.fileSize + project.previewSize,
      0,
    );
  }
  const result = await runQuery<{ total: string }>(client,
    `select coalesce(sum(file_size + preview_size), 0)::text as total
       from projects where ($1::uuid is null or owner_id = $1)`,
    [ownerId ?? null],
  );
  return Number(result.rows[0]?.total ?? 0);
}

async function getDiskSpace() {
  let stats;
  try {
    stats = await statfs(env.dataDir, { bigint: true });
  } catch {
    stats = await statfs(process.cwd(), { bigint: true });
  }
  return {
    totalBytes: Number(stats.blocks * stats.bsize),
    availableBytes: Number(stats.bavail * stats.bsize),
  };
}

export async function getPlatformStorageBudget(client?: PoolClient): Promise<PlatformStorageBudget> {
  const [prototypeUsedBytes, disk, backup] = await Promise.all([
    getStorageUsageBytes(undefined, client),
    getDiskSpace(),
    getBackupStatus(),
  ]);
  return calculatePlatformStorageBudget(
    prototypeUsedBytes,
    disk.totalBytes,
    disk.availableBytes,
    env.storageReserveRatio,
    backup?.repositorySizeBytes ?? 0,
    backup?.prototypeVolumeBytes ?? prototypeUsedBytes,
    backup?.status ?? null,
  );
}

async function getUserQuotaBytes(ownerId: string, client?: PoolClient) {
  if (isDemoMode) {
    return demoStore.users.find((user) => user.id === ownerId)?.storageQuotaBytes
      ?? DEFAULT_USER_STORAGE_QUOTA_BYTES;
  }
  const result = await runQuery<{ storage_quota_bytes: string }>(client,
    "select storage_quota_bytes::text from users where id = $1",
    [ownerId],
  );
  if (!result.rows[0]) throw new Error("原型负责人不存在");
  return Number(result.rows[0].storage_quota_bytes);
}

export async function assertUploadWithinBudget(
  ownerId: string,
  fileSize: number,
  replacedSize = 0,
  client?: PoolClient,
) {
  if (!Number.isFinite(fileSize) || fileSize <= 0) {
    throw new Error("原型文件不能为空");
  }
  if (client) await client.query("select pg_advisory_xact_lock(8072027)");
  const [platformBudget, userUsedBytes, userQuotaBytes] = client
    ? [
        await getPlatformStorageBudget(client),
        await getStorageUsageBytes(ownerId, client),
        await getUserQuotaBytes(ownerId, client),
      ]
    : await Promise.all([
        getPlatformStorageBudget(),
        getStorageUsageBytes(ownerId),
        getUserQuotaBytes(ownerId),
      ]);
  if (userUsedBytes - replacedSize + fileSize > userQuotaBytes) {
    throw new Error("个人存储用量已达到阈值，请删除不再使用的原型后重试");
  }
  if (fileSize > platformBudget.uploadAvailableBytes) {
    throw new Error("平台存储已达到安全阈值，请删除不再使用的原型后重试");
  }
  return {
    userUsedBytes,
    userQuotaBytes,
    platformUsedBytes: platformBudget.prototypeUsedBytes,
    platformLimitBytes: platformBudget.safeCapacityBytes,
  };
}

export function isHtmlDocument(content: string) {
  const head = content.replace(/^\uFEFF/, "").trimStart().slice(0, 64 * 1024);
  if (!head || head.includes("\u0000")) return false;
  if (/<!doctype\s+html\b|<html\b/i.test(head)) return true;
  // 浏览器可以直接渲染未包含 html/body 外壳的 HTML 片段，很多原型生成器会输出这种文件。
  return /<(?:head|body|title|meta|link|style|script|main|div|section|article|header|footer|nav|aside|form|table|canvas|svg|h[1-6]|p)\b[^>]*>/i.test(head);
}
