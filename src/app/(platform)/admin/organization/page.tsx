import { OrganizationManager } from "@/components/organization-manager";
import { requireAdmin } from "@/lib/auth";
import { listDepartments, listUsers } from "@/lib/data";
import { getAllowedDepartmentIds } from "@/lib/department-scope";

export default async function OrganizationPage() {
  const actor = await requireAdmin();
  const [allDepartments, allUsers, allowed] = await Promise.all([
    listDepartments(),
    listUsers(),
    getAllowedDepartmentIds(actor),
  ]);
  const departments = allDepartments.filter((item) => allowed.has(item.id));
  const users = allUsers.filter((item) => allowed.has(item.departmentId));
  return <OrganizationManager initialDepartments={departments} initialUsers={users} actor={actor} />;
}
