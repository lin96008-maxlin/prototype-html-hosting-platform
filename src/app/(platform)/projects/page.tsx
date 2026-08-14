import { ProjectsWorkspace } from "@/components/projects-workspace";
import { requireUser } from "@/lib/auth";
import { listCategories, listGroups, listProjectsForOwner } from "@/lib/data";
import { env } from "@/lib/env";
import { getStorageUsageBytes } from "@/lib/storage-budget";

export default async function ProjectsPage() {
  const user = await requireUser();
  const [projects, groups, categories, storageBytes] = await Promise.all([
    listProjectsForOwner(user.id),
    listGroups(user.id),
    listCategories(),
    getStorageUsageBytes(user.id),
  ]);
  return (
    <ProjectsWorkspace
      initialProjects={projects}
      initialGroups={groups}
      categories={categories}
      demoUrl={env.demoUrl}
      storageBytes={storageBytes}
      storageLimitBytes={user.storageQuotaBytes}
    />
  );
}
