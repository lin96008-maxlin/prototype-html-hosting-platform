import type {
  BusinessCategory,
  Department,
  InvitationCode,
  LoginLog,
  PlatformStats,
  PrototypeGroup,
  PrototypeProject,
  UserProfile,
} from "@/lib/types";
import { withBasePath } from "@/lib/app-path";
import { DEFAULT_USER_STORAGE_QUOTA_BYTES } from "@/lib/storage-quota";

interface DemoStore {
  departments: Department[];
  users: UserProfile[];
  categories: BusinessCategory[];
  groups: PrototypeGroup[];
  projects: PrototypeProject[];
  invitations: InvitationCode[];
  loginLogs: LoginLog[];
  passwords: Map<string, string>;
  htmlFiles: Map<string, string | Uint8Array>;
  previewFiles: Map<string, Uint8Array>;
  sharePasswords: Map<string, string>;
}

function createStore(): DemoStore {
  const now = new Date();
  const isoDaysAgo = (days: number) =>
    new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
  const departments: Department[] = [
    { id: "dept-root", name: "示例组织", parentId: null, sortOrder: 1 },
    { id: "dept-product", name: "产品中心", parentId: "dept-root", sortOrder: 1 },
    { id: "dept-collaboration", name: "协作产品组", parentId: "dept-product", sortOrder: 1 },
    { id: "dept-commerce", name: "商业产品组", parentId: "dept-product", sortOrder: 2 },
    { id: "dept-data", name: "数据产品组", parentId: "dept-product", sortOrder: 3 },
    { id: "dept-design", name: "用户体验组", parentId: "dept-root", sortOrder: 2 },
  ];

  const users: UserProfile[] = [
    {
      id: "user-admin",
      account: "admin",
      name: "演示管理员",
      departmentId: "dept-product",
      departmentName: "产品中心",
      role: "super_admin",
      status: "active",
      mustChangePassword: false,
      tempPasswordExpiresAt: null,
      storageQuotaBytes: 10 * 1024 * 1024 * 1024,
      createdAt: isoDaysAgo(92),
    },
    {
      id: "user-product",
      account: "product01",
      name: "产品经理",
      departmentId: "dept-collaboration",
      departmentName: "协作产品组",
      role: "user",
      status: "active",
      mustChangePassword: false,
      tempPasswordExpiresAt: null,
      storageQuotaBytes: 2 * 1024 * 1024 * 1024,
      createdAt: isoDaysAgo(61),
    },
    {
      id: "user-design",
      account: "designer01",
      name: "设计负责人",
      departmentId: "dept-commerce",
      departmentName: "商业产品组",
      role: "admin",
      status: "active",
      mustChangePassword: false,
      tempPasswordExpiresAt: null,
      storageQuotaBytes: 5 * 1024 * 1024 * 1024,
      createdAt: isoDaysAgo(43),
    },
    {
      id: "user-data",
      account: "data01",
      name: "数据产品经理",
      departmentId: "dept-data",
      departmentName: "数据产品组",
      role: "user",
      status: "active",
      mustChangePassword: false,
      tempPasswordExpiresAt: null,
      storageQuotaBytes: 1024 * 1024 * 1024,
      createdAt: isoDaysAgo(18),
    },
  ];

  const categories: BusinessCategory[] = [
    { id: "cat-collaboration", name: "协作工具", sortOrder: 1, enabled: true },
    { id: "cat-commerce", name: "电商零售", sortOrder: 2, enabled: true },
    { id: "cat-data", name: "数据产品", sortOrder: 3, enabled: true },
    { id: "cat-content", name: "内容平台", sortOrder: 4, enabled: true },
    { id: "cat-other", name: "其他", sortOrder: 5, enabled: true },
  ];

  const groups: PrototypeGroup[] = [
    { id: "group-all", ownerId: "user-admin", parentId: null, name: "近期项目", sortOrder: 1 },
    { id: "group-commerce", ownerId: "user-admin", parentId: null, name: "商业产品", sortOrder: 2 },
    { id: "group-collaboration", ownerId: "user-admin", parentId: null, name: "协作工具", sortOrder: 3 },
    { id: "group-archive", ownerId: "user-admin", parentId: null, name: "历史归档", sortOrder: 4 },
  ];

  const projects: PrototypeProject[] = [
    {
      id: "project-1",
      publicCode: "qu3FeXz5",
      shareCode: "s8Lw2Kp9",
      name: "客户协作工作台",
      ownerId: "user-admin",
      ownerName: "演示管理员",
      departmentId: "dept-product",
      departmentName: "产品中心",
      groupId: "group-all",
      categoryId: "cat-data",
      categoryName: "数据产品",
      htmlPath: "demo/project-1.html",
      sourceKind: "html",
      sourceName: "客户协作工作台.html",
      previewPath: null,
      previewUrl: withBasePath("/api/mock-preview/project-1"),
      previewSize: 82_310,
      previewStatus: "ready",
      previewError: null,
      fileSize: 4_821_936,
      isPublic: true,
      shareEnabled: true,
      shareExpiresAt: null,
      shareHasPassword: true,
      shareVersion: 1,
      visitCount: 286,
      createdAt: isoDaysAgo(23),
      updatedAt: isoDaysAgo(0),
    },
    {
      id: "project-2",
      publicCode: "Hx7MpQe2",
      shareCode: "a9Vm3Rd6",
      name: "商品运营管理台",
      ownerId: "user-admin",
      ownerName: "演示管理员",
      departmentId: "dept-commerce",
      departmentName: "商业产品组",
      groupId: "group-commerce",
      categoryId: "cat-commerce",
      categoryName: "电商零售",
      htmlPath: "demo/project-2.html",
      sourceKind: "html",
      sourceName: "商品运营管理台.html",
      previewPath: null,
      previewUrl: withBasePath("/api/mock-preview/project-2"),
      previewSize: 76_420,
      previewStatus: "ready",
      previewError: null,
      fileSize: 3_153_420,
      isPublic: true,
      shareEnabled: false,
      shareExpiresAt: null,
      shareHasPassword: false,
      shareVersion: 1,
      visitCount: 174,
      createdAt: isoDaysAgo(38),
      updatedAt: isoDaysAgo(3),
    },
    {
      id: "project-3",
      publicCode: "P5cd8Nw4",
      shareCode: "m2Jf7Qz1",
      name: "内容发布协作平台",
      ownerId: "user-admin",
      ownerName: "演示管理员",
      departmentId: "dept-collaboration",
      departmentName: "协作产品组",
      groupId: "group-collaboration",
      categoryId: "cat-collaboration",
      categoryName: "协作工具",
      htmlPath: "demo/project-3.html",
      sourceKind: "html",
      sourceName: "内容发布协作平台.html",
      previewPath: null,
      previewUrl: withBasePath("/api/mock-preview/project-3"),
      previewSize: 71_860,
      previewStatus: "ready",
      previewError: null,
      fileSize: 2_742_801,
      isPublic: false,
      shareEnabled: true,
      shareExpiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      shareHasPassword: false,
      shareVersion: 1,
      visitCount: 93,
      createdAt: isoDaysAgo(15),
      updatedAt: isoDaysAgo(5),
    },
    {
      id: "project-4",
      publicCode: "B8vr6Sa0",
      shareCode: "t4Nx9Wu3",
      name: "数据分析驾驶舱",
      ownerId: "user-admin",
      ownerName: "演示管理员",
      departmentId: "dept-data",
      departmentName: "数据产品组",
      groupId: "group-archive",
      categoryId: "cat-data",
      categoryName: "数据产品",
      htmlPath: "demo/project-4.html",
      sourceKind: "html",
      sourceName: "数据分析驾驶舱.html",
      previewPath: null,
      previewUrl: withBasePath("/api/mock-preview/project-4"),
      previewSize: 69_210,
      previewStatus: "ready",
      previewError: null,
      fileSize: 3_917_285,
      isPublic: false,
      shareEnabled: false,
      shareExpiresAt: null,
      shareHasPassword: false,
      shareVersion: 1,
      visitCount: 41,
      createdAt: isoDaysAgo(72),
      updatedAt: isoDaysAgo(26),
    },
  ];

  return {
    departments,
    users,
    categories,
    groups,
    projects,
    invitations: [
      {
        id: "invite-1",
        code: "DEMO-8Q4K-2M7P",
        expiresAt: new Date(now.getTime() + 8 * 60 * 1000).toISOString(),
        usedAt: null,
        usedByName: null,
        createdByName: "演示管理员",
        createdAt: new Date(now.getTime() - 2 * 60 * 1000).toISOString(),
      },
      {
        id: "invite-2",
        code: "DEMO-1C6R-9T3A",
        expiresAt: isoDaysAgo(2),
        usedAt: isoDaysAgo(2),
        usedByName: "数据产品经理",
        createdByName: "演示管理员",
        createdAt: isoDaysAgo(2),
      },
    ],
    loginLogs: [
      { id: "log-1", account: "admin", userName: "演示管理员", success: true, ipAddress: "192.0.2.10", createdAt: isoDaysAgo(0) },
      { id: "log-2", account: "designer01", userName: "设计负责人", success: true, ipAddress: "192.0.2.11", createdAt: isoDaysAgo(0) },
      { id: "log-3", account: "product01", userName: "产品经理", success: true, ipAddress: "192.0.2.12", createdAt: isoDaysAgo(1) },
      { id: "log-4", account: "unknown", userName: null, success: false, ipAddress: "192.0.2.13", createdAt: isoDaysAgo(1) },
    ],
    passwords: new Map([
      ["admin", "Prototype@123"],
      ["product01", "Prototype@123"],
      ["designer01", "Prototype@123"],
      ["data01", "Prototype@123"],
    ]),
    htmlFiles: new Map(),
    previewFiles: new Map(),
    sharePasswords: new Map([["project-1", "prototype_demo"]]),
  };
}

declare global {
  var __prototypeDemoStore: DemoStore | undefined;
}

export const demoStore = globalThis.__prototypeDemoStore ?? createStore();
demoStore.users.forEach((user) => {
  user.storageQuotaBytes ??= DEFAULT_USER_STORAGE_QUOTA_BYTES;
});
demoStore.projects.forEach((project) => {
  project.shareVersion ??= 1;
  project.previewStatus ??= project.previewUrl ? "ready" : "pending";
  project.previewError ??= null;
});
if (process.env.NODE_ENV !== "production") globalThis.__prototypeDemoStore = demoStore;

export function resetDemoStore() {
  const fresh = createStore();
  demoStore.departments = fresh.departments;
  demoStore.users = fresh.users;
  demoStore.categories = fresh.categories;
  demoStore.groups = fresh.groups;
  demoStore.projects = fresh.projects;
  demoStore.invitations = fresh.invitations;
  demoStore.loginLogs = fresh.loginLogs;
  demoStore.passwords = fresh.passwords;
  demoStore.sharePasswords = fresh.sharePasswords;
  demoStore.htmlFiles = fresh.htmlFiles;
  demoStore.previewFiles = fresh.previewFiles;
}

export function getDemoStats(): PlatformStats {
  const pv = demoStore.projects.reduce((total, project) => total + project.visitCount, 0);
  return {
    pv,
    uv: Math.min(demoStore.users.length, pv),
    uploads: demoStore.projects.length,
    updates: 0,
    logins: demoStore.loginLogs.filter((item) => item.success).length,
    projects: demoStore.projects.length,
    storageBytes: demoStore.projects.reduce(
      (total, project) => total + project.fileSize + project.previewSize,
      0,
    ),
  };
}

export function getDepartmentDescendantIds(rootId: string) {
  const result = new Set<string>([rootId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const department of demoStore.departments) {
      if (department.parentId && result.has(department.parentId) && !result.has(department.id)) {
        result.add(department.id);
        changed = true;
      }
    }
  }
  return result;
}
