import { AnalyticsDashboard } from "@/components/analytics-dashboard";
import { requireAdmin } from "@/lib/auth";
import { getPlatformStats, getScopedPlatformStats, listLoginLogs, listProjectsForDepartments, listScopedLoginLogs, listUsers } from "@/lib/data";
import { getAllowedDepartmentIds } from "@/lib/department-scope";
import { getPlatformStorageBudget } from "@/lib/storage-budget";

export default async function AnalyticsPage() {
  const actor = await requireAdmin();
  const allowed = await getAllowedDepartmentIds(actor);
  const allUsers = await listUsers();
  const scopedUsers = allUsers.filter((item) => allowed.has(item.departmentId));
  const loginLogs = actor.role === "super_admin"
    ? listLoginLogs()
    : listScopedLoginLogs(scopedUsers.map((item) => item.id));
  const [stats, projects, logs, storageBudget] = await Promise.all([
    actor.role === "super_admin" ? getPlatformStats() : getScopedPlatformStats(allowed),
    listProjectsForDepartments(allowed),
    loginLogs,
    getPlatformStorageBudget(),
  ]);
  return <AnalyticsDashboard stats={stats} projects={projects} logs={logs} storageBudget={storageBudget} />;
}
