import { canManageDepartment } from "@/lib/access-policy";
import { getAllowedDepartmentIds } from "@/lib/department-scope";
import type { PrototypeProject, UserProfile } from "@/lib/types";

export async function canManageProject(user: UserProfile, project: PrototypeProject) {
  if (user.id === project.ownerId) return true;
  const allowed = await getAllowedDepartmentIds(user);
  return canManageDepartment(user, project.departmentId, allowed);
}

export async function canViewProject(user: UserProfile, project: PrototypeProject) {
  if (user.id === project.ownerId) return true;
  const allowed = await getAllowedDepartmentIds(user);
  return allowed.has(project.departmentId);
}

export async function canDownloadProject(user: UserProfile, project: PrototypeProject) {
  return canManageProject(user, project);
}
