import type { UserProfile } from "@/lib/types";

export type AccessRoute = "public" | "share";

export interface AccessProject {
  ownerId: string;
  departmentId: string;
  isPublic: boolean;
  shareEnabled: boolean;
  shareExpiresAt: string | null;
  shareHasPassword: boolean;
}

export interface AccessDecision {
  allowed: boolean;
  needsPassword: boolean;
  reason:
    | "allowed"
    | "login_required"
    | "not_public"
    | "share_disabled"
    | "share_expired"
    | "password_required";
}

export function canManageDepartment(
  actor: UserProfile,
  departmentId: string,
  allowedDepartmentIds: ReadonlySet<string>,
) {
  if (actor.role === "super_admin") return true;
  return actor.role === "admin" && allowedDepartmentIds.has(departmentId);
}

export function decideProjectAccess(input: {
  actor: UserProfile | null;
  project: AccessProject;
  route: AccessRoute;
  passwordVerified?: boolean;
  allowedDepartmentIds?: ReadonlySet<string>;
  now?: Date;
}): AccessDecision {
  const { actor, project, route } = input;
  if (!actor && route === "public") {
    return { allowed: false, needsPassword: false, reason: "login_required" };
  }

  const privileged = Boolean(actor) && (
    actor!.id === project.ownerId ||
    Boolean(input.allowedDepartmentIds?.has(project.departmentId)) ||
    canManageDepartment(
      actor!,
      project.departmentId,
      input.allowedDepartmentIds ?? new Set<string>(),
    ));

  if (route === "public") {
    if (project.isPublic || privileged) {
      return { allowed: true, needsPassword: false, reason: "allowed" };
    }
    return { allowed: false, needsPassword: false, reason: "not_public" };
  }

  if (!project.shareEnabled) {
    return { allowed: false, needsPassword: false, reason: "share_disabled" };
  }

  if (
    project.shareExpiresAt &&
    new Date(project.shareExpiresAt).getTime() <= (input.now ?? new Date()).getTime()
  ) {
    return { allowed: false, needsPassword: false, reason: "share_expired" };
  }

  if (project.shareHasPassword && !input.passwordVerified) {
    return { allowed: false, needsPassword: true, reason: "password_required" };
  }

  return { allowed: true, needsPassword: false, reason: "allowed" };
}
