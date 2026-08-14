import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { query } from "@/lib/db";
import { demoStore } from "@/lib/demo-store";
import { isDemoMode } from "@/lib/env";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";
import type { UserProfile } from "@/lib/types";
import { DEFAULT_USER_STORAGE_QUOTA_BYTES } from "@/lib/storage-quota";

export const DEMO_SESSION_COOKIE = "prototype_demo_session";

function mapProfile(row: Record<string, unknown>): UserProfile {
  return {
    id: String(row.id),
    account: String(row.account),
    name: String(row.name),
    departmentId: String(row.department_id),
    departmentName: String(row.department_name ?? "未分配部门"),
    role: row.role as UserProfile["role"],
    status: row.status as UserProfile["status"],
    mustChangePassword: Boolean(row.must_change_password),
    tempPasswordExpiresAt: row.temp_password_expires_at
      ? String(row.temp_password_expires_at)
      : null,
    storageQuotaBytes: Number(row.storage_quota_bytes ?? DEFAULT_USER_STORAGE_QUOTA_BYTES),
    createdAt: String(row.created_at),
  };
}

export async function getCurrentUser(options: { allowMustChangePassword?: boolean } = {}): Promise<UserProfile | null> {
  if (isDemoMode) {
    const account = (await cookies()).get(DEMO_SESSION_COOKIE)?.value;
    const user = demoStore.users.find((item) => item.account === account && item.status === "active") ?? null;
    if (user?.mustChangePassword && !options.allowMustChangePassword) return null;
    return user;
  }

  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await verifySessionToken(token);
  if (!session) return null;

  const result = await query(
    `select u.id, u.account, u.name, u.department_id, d.name as department_name,
            u.role, u.status, u.must_change_password, u.temp_password_expires_at,
            u.storage_quota_bytes, u.created_at
       from users u
       join departments d on d.id = u.department_id
      where u.id = $1 and u.session_version = $2 and u.status = 'active'`,
    [session.userId, session.sessionVersion],
  );
  const user = result.rows[0] ? mapProfile(result.rows[0]) : null;
  if (user?.mustChangePassword && !options.allowMustChangePassword) return null;
  return user;
}

export async function requireUser() {
  const user = await getCurrentUser({ allowMustChangePassword: true });
  if (!user) redirect("/login");
  if (user.mustChangePassword) redirect("/change-password");
  return user;
}

export async function requireAdmin() {
  const user = await requireUser();
  if (user.role === "user") redirect("/projects");
  return user;
}

export async function requireSuperAdmin() {
  const user = await requireAdmin();
  if (user.role !== "super_admin") redirect("/admin/organization");
  return user;
}
