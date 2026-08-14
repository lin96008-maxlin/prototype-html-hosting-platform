import { describe, expect, it } from "vitest";
import { decideProjectAccess } from "@/lib/access-policy";
import type { UserProfile } from "@/lib/types";

const actor: UserProfile = {
  id: "user-1",
  account: "linzi",
  name: "林子",
  departmentId: "dept-1",
  departmentName: "产品中心",
  role: "user",
  status: "active",
  mustChangePassword: false,
  tempPasswordExpiresAt: null,
  storageQuotaBytes: 10 * 1024 * 1024 * 1024,
  createdAt: "2026-08-01T00:00:00.000Z",
};

const project = {
  ownerId: "owner-1",
  departmentId: "dept-2",
  isPublic: true,
  shareEnabled: false,
  shareExpiresAt: null,
  shareHasPassword: false,
};

describe("公开链接与分享链接", () => {
  it("公开链接只校验登录态和公开开关", () => {
    expect(decideProjectAccess({ actor, project, route: "public" }).allowed).toBe(true);
  });

  it("公开不会自动开启分享链接", () => {
    expect(decideProjectAccess({ actor, project, route: "share" }).reason).toBe(
      "share_disabled",
    );
  });

  it("分享链接独立校验密码", () => {
    const shared = { ...project, isPublic: false, shareEnabled: true, shareHasPassword: true };
    expect(decideProjectAccess({ actor, project: shared, route: "share" })).toMatchObject({
      allowed: false,
      needsPassword: true,
      reason: "password_required",
    });
    expect(
      decideProjectAccess({
        actor,
        project: shared,
        route: "share",
        passwordVerified: true,
      }).allowed,
    ).toBe(true);
  });

  it("公开链接未登录时不可访问", () => {
    expect(decideProjectAccess({ actor: null, project, route: "public" }).reason).toBe(
      "login_required",
    );
  });

  it("同部门人员可通过部门原型访问未公开原型", () => {
    expect(decideProjectAccess({
      actor,
      project: { ...project, departmentId: actor.departmentId, isPublic: false },
      route: "public",
      allowedDepartmentIds: new Set([actor.departmentId]),
    }).allowed).toBe(true);
  });

  it("普通用户不能访问其他部门的未公开原型", () => {
    expect(decideProjectAccess({
      actor,
      project: { ...project, isPublic: false },
      route: "public",
      allowedDepartmentIds: new Set([actor.departmentId]),
    }).allowed).toBe(false);
  });

  it("分享链接不要求平台账号，但仍校验开关和密码", () => {
    const shared = { ...project, isPublic: false, shareEnabled: true };
    expect(decideProjectAccess({ actor: null, project: shared, route: "share" }).allowed).toBe(true);
    expect(decideProjectAccess({
      actor: null,
      project: { ...shared, shareHasPassword: true },
      route: "share",
    })).toMatchObject({ allowed: false, needsPassword: true, reason: "password_required" });
  });
});
