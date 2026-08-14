import { AdminProjectsWorkspace } from "@/components/admin-projects-workspace";
import { requireUser } from "@/lib/auth";
import { listCategories, listDepartments, listProjectsForDepartments } from "@/lib/data";
import { getAllowedDepartmentIds } from "@/lib/department-scope";
import { env } from "@/lib/env";

export default async function AdminProjectsPage() {
  const actor = await requireUser();
  const [allDepartments, allowed, categories] = await Promise.all([listDepartments(), getAllowedDepartmentIds(actor), listCategories()]);
  const departments = allDepartments.filter((item) => allowed.has(item.id));
  const projects = await listProjectsForDepartments(allowed);
  return (
    <AdminProjectsWorkspace
      initialProjects={projects}
      departments={departments}
      categories={categories}
      demoUrl={env.demoUrl}
      canManage={actor.role !== "user"}
    />
  );
}
