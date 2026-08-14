export type UserRole = "user" | "admin" | "super_admin";

export interface Department {
  id: string;
  name: string;
  parentId: string | null;
  sortOrder: number;
}

export interface UserProfile {
  id: string;
  account: string;
  name: string;
  departmentId: string;
  departmentName: string;
  role: UserRole;
  status: "active" | "disabled";
  mustChangePassword: boolean;
  tempPasswordExpiresAt: string | null;
  storageQuotaBytes: number;
  storageUsedBytes?: number;
  createdAt: string;
}

export interface PrototypeGroup {
  id: string;
  ownerId: string;
  parentId: string | null;
  name: string;
  sortOrder: number;
}

export interface BusinessCategory {
  id: string;
  name: string;
  sortOrder: number;
  enabled: boolean;
}

export interface PrototypeProject {
  id: string;
  publicCode: string;
  shareCode: string;
  name: string;
  ownerId: string;
  ownerName: string;
  departmentId: string;
  departmentName: string;
  groupId: string | null;
  categoryId: string | null;
  categoryName: string | null;
  htmlPath: string;
  sourceKind: "html" | "zip" | "rar" | "folder";
  sourceName: string;
  previewPath: string | null;
  previewUrl?: string | null;
  previewStatus: "pending" | "ready" | "failed";
  previewError: string | null;
  previewSize: number;
  fileSize: number;
  isPublic: boolean;
  shareEnabled: boolean;
  shareExpiresAt: string | null;
  shareHasPassword: boolean;
  sharePassword?: string | null;
  shareVersion: number;
  visitCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface InvitationCode {
  id: string;
  code: string;
  expiresAt: string;
  usedAt: string | null;
  usedByName: string | null;
  createdByName: string;
  createdAt: string;
}

export interface LoginLog {
  id: string;
  account: string;
  userName: string | null;
  success: boolean;
  ipAddress: string | null;
  createdAt: string;
}

export interface PlatformStats {
  pv: number;
  uv: number;
  uploads: number;
  updates: number;
  logins: number;
  projects: number;
  storageBytes?: number;
}
