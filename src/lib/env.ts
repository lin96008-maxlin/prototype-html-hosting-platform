import { appBasePath } from "@/lib/app-path";

const configuredStorageReserveRatio = Number(process.env.STORAGE_RESERVE_RATIO ?? "0.2");

export const env = {
  databaseUrl: process.env.DATABASE_URL,
  databasePoolMax: Number(process.env.DATABASE_POOL_MAX ?? 5),
  dataDir: process.env.DATA_DIR ?? ".data",
  backupStatusDir: process.env.BACKUP_STATUS_DIR,
  manageUrl:
    process.env.MANAGE_URL ??
    process.env.NEXT_PUBLIC_MANAGE_URL ??
    `http://localhost:3000${appBasePath}`,
  demoUrl:
    process.env.DEMO_URL ??
    process.env.NEXT_PUBLIC_DEMO_URL ??
    process.env.MANAGE_URL ??
    process.env.NEXT_PUBLIC_MANAGE_URL ??
    "http://localhost:3000",
  authCookieDomain: process.env.AUTH_COOKIE_DOMAIN,
  chromiumExecutablePath: process.env.CHROMIUM_EXECUTABLE_PATH,
  sessionSigningSecret: process.env.SESSION_SIGNING_SECRET,
  sharePasswordEncryptionKey: process.env.SHARE_PASSWORD_ENCRYPTION_KEY,
  storageReserveRatio:
    Number.isFinite(configuredStorageReserveRatio) &&
    configuredStorageReserveRatio >= 0 &&
    configuredStorageReserveRatio < 1
      ? configuredStorageReserveRatio
      : 0.2,
};

const databaseConfigured = Boolean(env.databaseUrl);

export const isDemoMode =
  process.env.NODE_ENV !== "production" &&
  (process.env.DEMO_MODE === "true" || !databaseConfigured);

export function assertDatabaseConfigured() {
  if (!databaseConfigured) {
    throw new Error("缺少 DATABASE_URL，无法连接 PostgreSQL 数据库");
  }
}
