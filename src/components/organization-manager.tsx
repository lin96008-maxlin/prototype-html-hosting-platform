"use client";

import { useMemo, useState } from "react";
import {
  Check,
  ChevronRight,
  Copy,
  Edit3,
  Folder,
  FolderPlus,
  KeyRound,
  PanelLeft,
  RefreshCw,
  Search,
  Trash2,
  UserCog,
  UserPlus,
  UsersRound,
  X,
} from "lucide-react";
import { PlatformSelect, PlatformTreeSelect } from "@/components/platform-select";
import { Pagination } from "@/components/pagination";
import { SuccessMessage } from "@/components/success-message";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { withBasePath } from "@/lib/app-path";
import { DEFAULT_USER_STORAGE_QUOTA_MB } from "@/lib/storage-quota";
import type { Department, UserProfile } from "@/lib/types";

type Dialog = "department" | "user" | "user-result" | "password" | "password-result" | null;
type DeleteTarget = { type: "department"; item: Department } | { type: "user"; item: UserProfile };

function passwordValue() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789@#$%";
  const values = crypto.getRandomValues(new Uint32Array(14));
  return Array.from(values, (value) => chars[value % chars.length]).join("");
}

function descendants(departments: Department[], id: string) {
  const ids = new Set([id]);
  let changed = true;
  while (changed) {
    changed = false;
    departments.forEach((item) => {
      if (item.parentId && ids.has(item.parentId) && !ids.has(item.id)) {
        ids.add(item.id);
        changed = true;
      }
    });
  }
  return ids;
}

export function OrganizationManager({
  initialDepartments,
  initialUsers,
  actor,
}: {
  initialDepartments: Department[];
  initialUsers: UserProfile[];
  actor: UserProfile;
}) {
  const [departments, setDepartments] = useState(initialDepartments);
  const [users, setUsers] = useState(initialUsers);
  const [selectedDepartment, setSelectedDepartment] = useState(
    initialDepartments[0]?.id ?? "",
  );
  const [expanded, setExpanded] = useState(
    () => new Set(initialDepartments.map((item) => item.id)),
  );
  const [dialog, setDialog] = useState<Dialog>(null);
  const [activeDepartment, setActiveDepartment] = useState<Department | null>(
    null,
  );
  const [activeUser, setActiveUser] = useState<UserProfile | null>(null);
  const [departmentName, setDepartmentName] = useState("");
  const [parentId, setParentId] = useState<string>("");
  const [role, setRole] = useState<UserProfile["role"]>("user");
  const [status, setStatus] = useState<UserProfile["status"]>("active");
  const [userDepartmentId, setUserDepartmentId] = useState("");
  const [userAccount, setUserAccount] = useState("");
  const [userName, setUserName] = useState("");
  const [storageQuotaMb, setStorageQuotaMb] = useState(DEFAULT_USER_STORAGE_QUOTA_MB);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [tempPassword, setTempPassword] = useState("");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [mobileDepartmentsOpen, setMobileDepartmentsOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const isSuper = actor.role === "super_admin";

  const visibleUsers = useMemo(() => {
    const keyword = search.trim().toLocaleLowerCase("zh-CN");
    const ids = selectedDepartment ? descendants(departments, selectedDepartment) : null;
    return users.filter((user) =>
      (!ids || ids.has(user.departmentId))
      && (!keyword
        || user.name.toLocaleLowerCase("zh-CN").includes(keyword)
        || user.account.toLocaleLowerCase("zh-CN").includes(keyword)),
    );
  }, [departments, search, selectedDepartment, users]);
  const pageCount = Math.max(1, Math.ceil(visibleUsers.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const pagedUsers = visibleUsers.slice((safePage - 1) * pageSize, safePage * pageSize);
  const departmentUserCounts = useMemo(
    () => new Map(
      departments.map((department) => {
        const departmentIds = descendants(departments, department.id);
        return [
          department.id,
          users.filter((user) => departmentIds.has(user.departmentId)).length,
        ];
      }),
    ),
    [departments, users],
  );

  function openDepartment(item?: Department, parent?: string) {
    setActiveDepartment(item ?? null);
    setDepartmentName(item?.name ?? "");
    setParentId(item?.parentId ?? parent ?? "");
    setError("");
    setDialog("department");
  }

  function openUser(user?: UserProfile) {
    setActiveUser(user ?? null);
    setUserAccount(user?.account ?? "");
    setRole(user?.role ?? "user");
    setStatus(user?.status ?? "active");
    setUserDepartmentId(user?.departmentId ?? selectedDepartment ?? actor.departmentId);
    setUserName(user?.name ?? "");
    setStorageQuotaMb(user ? Math.round(user.storageQuotaBytes / 1024 / 1024) : DEFAULT_USER_STORAGE_QUOTA_MB);
    setError("");
    setDialog("user");
  }

  function openPassword(user: UserProfile) {
    setActiveUser(user);
    setTempPassword(passwordValue());
    setCopied(false);
    setError("");
    setDialog("password");
  }

  async function saveDepartment() {
    const endpoint = withBasePath(activeDepartment
      ? `/api/admin/departments/${activeDepartment.id}`
      : "/api/admin/departments");
    const response = await fetch(endpoint, {
      method: activeDepartment ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: departmentName,
        parentId: parentId || null,
      }),
    });
    const result = await response.json();
    if (!response.ok) return setError(result.message ?? "保存失败");
    if (activeDepartment)
      setDepartments((items) =>
        items.map((item) =>
          item.id === activeDepartment.id
            ? { ...item, name: departmentName, parentId: parentId || null }
            : item,
        ),
      );
    else setDepartments((items) => [...items, result.department]);
    setDialog(null);
    setMessage(activeDepartment ? "部门信息已保存" : "部门已新增");
  }

  async function removeDepartment(item: Department) {
    const response = await fetch(withBasePath(`/api/admin/departments/${item.id}`), {
      method: "DELETE",
    });
    const result = await response.json();
    if (!response.ok) {
      setDeleteTarget(null);
      return setError(result.message ?? "删除失败");
    }
    setDepartments((items) => items.filter((entry) => entry.id !== item.id));
    setDeleteTarget(null);
    setMessage("部门已删除");
  }

  async function saveUser() {
    const editingUser = activeUser;
    const creating = !editingUser;
    const response = await fetch(withBasePath(creating ? "/api/admin/users" : `/api/admin/users/${editingUser.id}`), {
      method: creating ? "POST" : "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...(creating ? { account: userAccount } : {}),
        name: userName,
        ...(creating || isSuper ? { role } : {}),
        status,
        departmentId: userDepartmentId,
        storageQuotaBytes: Math.round(storageQuotaMb * 1024 * 1024),
      }),
    });
    const result = await response.json();
    if (!response.ok) return setError(result.message ?? (creating ? "创建失败" : "保存失败"));
    const department = departments.find((item) => item.id === userDepartmentId);
    if (!editingUser) {
      const created = result.user as UserProfile;
      setUsers((items) => [created, ...items]);
      setActiveUser(created);
      setTempPassword(result.tempPassword);
      setCopied(false);
      setDialog("user-result");
      return;
    }
    setUsers((items) => items.map((item) => item.id === editingUser.id ? {
      ...item,
      name: userName,
      role,
      status,
      departmentId: userDepartmentId,
      departmentName: department?.name ?? item.departmentName,
      storageQuotaBytes: Math.round(storageQuotaMb * 1024 * 1024),
    } : item));
    setDialog(null);
    setMessage("人员信息已保存");
  }

  function roleLabel(value: UserProfile["role"]) {
    return value === "super_admin" ? "超级管理员" : value === "admin" ? "管理员" : "普通用户";
  }

  function userDeliveryText(user: UserProfile, password: string) {
    return [
      `人员姓名：${user.name}`,
      `登录账号：${user.account}`,
      `所属部门：${user.departmentName}`,
      `角色：${roleLabel(user.role)}`,
      `临时密码：${password}`,
      "有效期：24 小时",
      "首次登录后必须修改密码",
    ].join("\n");
  }

  async function resetPassword() {
    if (!activeUser) return;
    const response = await fetch(
      withBasePath(`/api/admin/users/${activeUser.id}/reset-password`),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: tempPassword }),
      },
    );
    const result = await response.json();
    if (!response.ok) return setError(result.message ?? "重置失败");
    setTempPassword(result.tempPassword);
    setDialog("password-result");
    setUsers((items) =>
      items.map((item) =>
        item.id === activeUser.id
          ? {
              ...item,
              mustChangePassword: true,
              tempPasswordExpiresAt: result.expiresAt,
            }
          : item,
      ),
    );
  }

  async function removeUser(user: UserProfile) {
    const response = await fetch(withBasePath(`/api/admin/users/${user.id}`), {
      method: "DELETE",
    });
    const result = await response.json();
    if (!response.ok) {
      setDeleteTarget(null);
      return setError(result.message ?? "删除失败");
    }
    setUsers((items) => items.filter((item) => item.id !== user.id));
    setDeleteTarget(null);
    setMessage("人员已删除");
  }

  function renderTree(parent: string | null, depth = 0): React.ReactNode {
    const children = departments.filter(
      (item) =>
        item.parentId === parent ||
        (parent === null &&
          item.parentId &&
          !departments.some((candidate) => candidate.id === item.parentId)),
    );
    return children.map((item) => {
      const hasChildren = departments.some(
        (entry) => entry.parentId === item.id,
      );
      return (
        <div key={item.id}>
          <div
            className={`department-node${selectedDepartment === item.id ? " is-active" : ""}`}
            style={{ paddingLeft: 8 + depth * 18 }}
          >
            <button
              className={`tree-chevron${expanded.has(item.id) ? " is-open" : ""}`}
              type="button"
              title={hasChildren ? `${expanded.has(item.id) ? "收起" : "展开"}${item.name}` : undefined}
              aria-label={hasChildren ? `${expanded.has(item.id) ? "收起" : "展开"}${item.name}` : undefined}
              disabled={!hasChildren}
              onClick={() =>
                setExpanded((value) => {
                  const next = new Set(value);
                  if (next.has(item.id)) next.delete(item.id);
                  else next.add(item.id);
                  return next;
                })
              }
            >
              <ChevronRight size={13} />
            </button>
            <button
              className="department-name"
              type="button"
              onClick={() => { setSelectedDepartment(item.id); setPage(1); setMobileDepartmentsOpen(false); }}
            >
              <Folder size={16} />
              <span>{item.name}</span>
              <b>{departmentUserCounts.get(item.id) ?? 0}</b>
            </button>
            {isSuper ? (
              <span className="department-tools">
                <button
                  className="icon-button"
                  type="button"
                  title="新增下级"
                  onClick={() => openDepartment(undefined, item.id)}
                >
                  <FolderPlus size={14} />
                </button>
                <button className="icon-button" type="button" title="编辑部门" onClick={() => openDepartment(item)}>
                  <Edit3 size={14} />
                </button>
                <button
                  className="icon-button danger"
                  type="button"
                  title="删除部门"
                  onClick={() => setDeleteTarget({ type: "department", item })}
                >
                  <Trash2 size={14} />
                </button>
              </span>
            ) : null}
          </div>
          {expanded.has(item.id) ? renderTree(item.id, depth + 1) : null}
        </div>
      );
    });
  }

  return (
    <section className="organization-layout">
      <SuccessMessage message={message} onClose={() => setMessage("")} />
      <aside className={`department-panel mobile-context-panel${mobileDepartmentsOpen ? " is-open" : ""}`} id="organization-department-panel">
        <header>
          <span>部门组织</span>
          {isSuper ? (
            <button
              className="icon-button"
              type="button"
              title="新增一级部门"
              onClick={() => openDepartment()}
            >
              <FolderPlus size={17} />
            </button>
          ) : null}
        </header>
        <div className="department-tree">{renderTree(null)}</div>
      </aside>
      <button className={`mobile-context-backdrop${mobileDepartmentsOpen ? " is-open" : ""}`} type="button" aria-label="关闭部门组织" tabIndex={mobileDepartmentsOpen ? 0 : -1} onClick={() => setMobileDepartmentsOpen(false)} />
      <div className="people-panel">
        <header className="page-panel-header people-head">
          <h1 className="page-panel-title">人员管理</h1>
          <div className="page-panel-actions">
            <button className="ui-button mobile-context-trigger" type="button" aria-controls="organization-department-panel" aria-expanded={mobileDepartmentsOpen} onClick={() => setMobileDepartmentsOpen(true)}><PanelLeft size={16} />部门</button>
            <span className="people-total">共 {visibleUsers.length} 人</span>
            <label className="search-box people-search">
              <input
                className="ui-input"
                aria-label="搜索人员姓名或账号"
                placeholder="搜索姓名或账号"
                value={search}
                onChange={(event) => { setSearch(event.target.value); setPage(1); }}
              />
              <Search size={15} />
            </label>
            <button className="ui-button ui-button-primary" type="button" title="新增人员" onClick={() => openUser()}>
              <UserPlus size={16} />
              新增人员
            </button>
          </div>
        </header>
        <div className="people-body">
        {error && !dialog ? (
          <div className="inline-error">
            {error}
            <button className="icon-button" onClick={() => setError("")}>
              <X size={15} />
            </button>
          </div>
        ) : null}
        <div className="people-results data-table-wrap">
          {visibleUsers.length === 0 ? (
            <div className="empty-state"><UsersRound size={42} /><b>暂无人员</b><p>当前部门范围内没有符合条件的人员</p></div>
          ) : (
          <table className="data-table people-table responsive-table">
            <thead>
              <tr>
                <th className="serial-column">序号</th>
                <th>姓名 / 账号</th>
                <th>部门</th>
                <th>角色</th>
                <th>状态</th>
                <th>密码状态</th>
                <th>存储用量 / 阈值</th>
                <th>注册时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {pagedUsers.map((user, index) => (
                <tr key={user.id}>
                  <td>{(safePage - 1) * pageSize + index + 1}</td>
                  <td>
                    <b>{user.name}</b>
                    <small>{user.account}</small>
                  </td>
                  <td>{user.departmentName}</td>
                  <td>
                    <span
                      className={`status-tag${user.role !== "user" ? " status-tag-primary" : ""}`}
                    >
                      {roleLabel(user.role)}
                    </span>
                  </td>
                  <td>
                    <span
                      className={`status-tag ${user.status === "active" ? "status-tag-success" : "status-tag-danger"}`}
                    >
                      {user.status === "active" ? "正常" : "已停用"}
                    </span>
                  </td>
                  <td>
                    {user.mustChangePassword ? (
                      <span className="status-tag status-tag-warning">
                        待修改临时密码
                      </span>
                    ) : (
                      "正常"
                    )}
                  </td>
                  <td>
                    {((user.storageUsedBytes ?? 0) / 1024 / 1024).toFixed(1)}MB / {(
                      user.storageQuotaBytes / 1024 / 1024
                    ).toFixed(1)}MB
                  </td>
                  <td>
                    {new Date(user.createdAt).toLocaleDateString("zh-CN")}
                  </td>
                  <td>
                    <div className="table-actions">
                      {isSuper || user.role === "user" ? (
                        <button
                          className="icon-button"
                          title="人员设置"
                          onClick={() => openUser(user)}
                        >
                          <UserCog size={16} />
                        </button>
                      ) : null}
                      {isSuper || user.role === "user" ? (
                        <button
                          className="icon-button"
                          title="重置密码"
                          onClick={() => openPassword(user)}
                        >
                          <KeyRound size={16} />
                        </button>
                      ) : null}
                      {user.id !== actor.id &&
                      (isSuper || user.role === "user") ? (
                        <button
                          className="icon-button danger"
                          title="删除用户"
                          onClick={() => setDeleteTarget({ type: "user", item: user })}
                        >
                          <Trash2 size={16} />
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          )}
        </div>
        {visibleUsers.length ? <Pagination total={visibleUsers.length} page={safePage} pageSize={pageSize} pageSizeOptions={[20, 50, 100]} onPageChange={setPage} onPageSizeChange={(value) => { setPageSize(value); setPage(1); }} /> : null}
        </div>
      </div>

      <ConfirmDialog open={Boolean(deleteTarget)} title={deleteTarget ? `删除“${deleteTarget.item.name}”？` : "确认删除？"} description={deleteTarget?.type === "user" ? "该人员的原型和账号数据将一并删除，此操作无法恢复。" : "部门删除后无法恢复，请先确认部门内没有人员或下级部门。"} onCancel={() => setDeleteTarget(null)} onConfirm={() => { if (deleteTarget?.type === "department") void removeDepartment(deleteTarget.item); if (deleteTarget?.type === "user") void removeUser(deleteTarget.item); }} />

      {dialog === "department" ? (
        <div className="modal-backdrop">
          <section className="modal" role="dialog" aria-modal="true">
            <header className="modal-header">
              <h2 className="modal-title">
                {activeDepartment ? "编辑部门" : "新增部门"}
              </h2>
              <button className="icon-button" onClick={() => setDialog(null)}>
                <X size={18} />
              </button>
            </header>
            <div className="modal-body">
              <div className="dialog-form">
                <label className="form-field">
                  <span className="form-label form-label-required">部门名称</span>
                  <input
                    className="ui-input"
                    value={departmentName}
                    onChange={(event) => setDepartmentName(event.target.value)}
                  />
                </label>
                <label className="form-field">
                  <span className="form-label">上级部门</span>
                  <PlatformTreeSelect
                    value={parentId}
                    onChange={setParentId}
                    emptyLabel="无，作为一级部门"
                    nodes={departments
                      .filter((item) => item.id !== activeDepartment?.id)
                      .map((item) => ({ id: item.id, label: item.name, parentId: item.parentId }))}
                  />
                </label>
                {error ? <div className="field-error">{error}</div> : null}
              </div>
            </div>
            <footer className="modal-footer">
              <button className="ui-button" onClick={() => setDialog(null)}>
                取消
              </button>
              <button
                className="ui-button ui-button-primary"
                onClick={() => void saveDepartment()}
              >
                保存
              </button>
            </footer>
          </section>
        </div>
      ) : null}

      {dialog === "user" ? (
        <div className="modal-backdrop">
          <section className="modal" role="dialog" aria-modal="true">
            <header className="modal-header">
              <h2 className="modal-title">{activeUser ? `编辑人员 - ${activeUser.name}` : "新增人员"}</h2>
              <button className="icon-button" onClick={() => setDialog(null)}>
                <X size={18} />
              </button>
            </header>
            <div className="modal-body">
              <div className="dialog-form">
                <label className="form-field">
                  <span className="form-label form-label-required">人员姓名</span>
                  <input className="ui-input" value={userName} onChange={(event) => setUserName(event.target.value)} maxLength={40} />
                </label>
                <label className="form-field">
                  <span className="form-label form-label-required">登录账号</span>
                  <input
                    className="ui-input"
                    value={userAccount}
                    disabled={Boolean(activeUser)}
                    maxLength={40}
                    placeholder="字母开头，可使用数字、点、横线或下划线"
                    onChange={(event) => setUserAccount(event.target.value)}
                  />
                  {activeUser ? <span className="field-help">登录账号创建后不可修改</span> : null}
                </label>
                <label className="form-field">
                  <span className="form-label form-label-required">所属部门</span>
                  <PlatformTreeSelect
                    value={userDepartmentId}
                    onChange={setUserDepartmentId}
                    nodes={departments.map((item) => ({ id: item.id, label: item.name, parentId: item.parentId }))}
                  />
                </label>
                <label className="form-field">
                  <span className="form-label form-label-required">角色</span>
                  <PlatformSelect
                    value={role}
                    disabled={!isSuper}
                    onChange={(value) => setRole(value as UserProfile["role"])}
                    options={[
                      { value: "user", label: "普通用户" },
                      { value: "admin", label: "管理员" },
                      { value: "super_admin", label: "超级管理员" },
                    ]}
                  />
                  <span className="field-help">
                    {isSuper ? "管理员默认获得所属部门及全部下级部门权限" : "普通管理员只能创建和维护普通用户"}
                  </span>
                </label>
                <label className="form-field">
                  <span className="form-label">个人存储阈值</span>
                  <span className="quota-input">
                    <input
                      className="ui-input"
                      type="number"
                      min={5}
                      step={1}
                      value={storageQuotaMb}
                      onChange={(event) => setStorageQuotaMb(Number(event.target.value))}
                    />
                    <span>MB</span>
                  </span>
                  {activeUser ? <span className="field-help">当前已用 {((activeUser.storageUsedBytes ?? 0) / 1024 / 1024).toFixed(1)}MB</span> : null}
                </label>
                <label className="form-field">
                  <span className="form-label">账号状态</span>
                  <PlatformSelect
                    value={status}
                    onChange={(value) => setStatus(value as UserProfile["status"])}
                    options={[
                      { value: "active", label: "正常" },
                      { value: "disabled", label: "停用" },
                    ]}
                  />
                </label>
                {error ? <div className="field-error">{error}</div> : null}
              </div>
            </div>
            <footer className="modal-footer">
              <button className="ui-button" onClick={() => setDialog(null)}>
                取消
              </button>
              <button
                className="ui-button ui-button-primary"
                onClick={() => void saveUser()}
              >
                保存
              </button>
            </footer>
          </section>
        </div>
      ) : null}

      {dialog === "user-result" && activeUser ? (
        <div className="modal-backdrop">
          <section className="modal" role="dialog" aria-modal="true">
            <header className="modal-header">
              <h2 className="modal-title">人员创建成功</h2>
              <button className="icon-button" title="关闭" onClick={() => setDialog(null)}>
                <X size={18} />
              </button>
            </header>
            <div className="modal-body">
              <div className="one-time-secret user-delivery">
                <Check size={24} />
                <h3>请将以下信息私下发送给 {activeUser.name}</h3>
                <p>临时密码仅在本弹窗展示一次，24 小时内有效。</p>
                <dl>
                  <div><dt>人员姓名</dt><dd>{activeUser.name}</dd></div>
                  <div><dt>登录账号</dt><dd>{activeUser.account}</dd></div>
                  <div><dt>所属部门</dt><dd>{activeUser.departmentName}</dd></div>
                  <div><dt>角色</dt><dd>{roleLabel(activeUser.role)}</dd></div>
                  <div><dt>临时密码</dt><dd><code>{tempPassword}</code></dd></div>
                </dl>
                <button
                  className="ui-button copy-delivery-button"
                  type="button"
                  onClick={async () => {
                    await navigator.clipboard.writeText(userDeliveryText(activeUser, tempPassword));
                    setCopied(true);
                  }}
                >
                  {copied ? <Check size={16} /> : <Copy size={16} />}
                  {copied ? "人员信息已复制" : "复制完整人员信息"}
                </button>
              </div>
            </div>
            <footer className="modal-footer">
              <button className="ui-button ui-button-primary" onClick={() => setDialog(null)}>
                我已记录
              </button>
            </footer>
          </section>
        </div>
      ) : null}

      {dialog === "password" && activeUser ? (
        <div className="modal-backdrop">
          <section className="modal" role="dialog" aria-modal="true">
            <header className="modal-header">
              <h2 className="modal-title">重置密码 - {activeUser.name}</h2>
              <button className="icon-button" onClick={() => setDialog(null)}>
                <X size={18} />
              </button>
            </header>
            <div className="modal-body">
              <div className="dialog-form">
                <div className="feature-callout">
                  <KeyRound size={18} />
                  <div>
                    <b>临时密码</b>
                    <p>24 小时内有效，用户下次登录时必须修改。</p>
                  </div>
                </div>
                <label className="form-field">
                  <span className="form-label">临时密码</span>
                  <span className="password-generate">
                    <input
                      className="ui-input"
                      value={tempPassword}
                      onChange={(event) => setTempPassword(event.target.value)}
                    />
                    <button
                      className="ui-button"
                      type="button"
                      onClick={() => setTempPassword(passwordValue())}
                    >
                      <RefreshCw size={15} />
                      重新生成
                    </button>
                  </span>
                  <span className="field-help">
                    可直接修改为管理员指定的密码，至少 10 位
                  </span>
                </label>
                {error ? <div className="field-error">{error}</div> : null}
              </div>
            </div>
            <footer className="modal-footer">
              <button className="ui-button" onClick={() => setDialog(null)}>
                取消
              </button>
              <button
                className="ui-button ui-button-primary"
                onClick={() => void resetPassword()}
              >
                确认重置
              </button>
            </footer>
          </section>
        </div>
      ) : null}

      {dialog === "password-result" && activeUser ? (
        <div className="modal-backdrop">
          <section className="modal" role="dialog" aria-modal="true">
            <header className="modal-header">
              <h2 className="modal-title">密码已重置</h2>
              <button className="icon-button" onClick={() => setDialog(null)}>
                <X size={18} />
              </button>
            </header>
            <div className="modal-body">
              <div className="one-time-secret">
                <Check size={24} />
                <h3>请立即交给 {activeUser.name}</h3>
                <p>关闭弹窗后系统不会再次展示该密码。</p>
                <span>
                  <code>{tempPassword}</code>
                  <button
                    title="复制临时密码"
                    onClick={async () => {
                      await navigator.clipboard.writeText(tempPassword);
                      setCopied(true);
                    }}
                  >
                    {copied ? <Check size={17} /> : <Copy size={17} />}
                  </button>
                </span>
              </div>
            </div>
            <footer className="modal-footer">
              <button
                className="ui-button ui-button-primary"
                onClick={() => setDialog(null)}
              >
                我已记录
              </button>
            </footer>
          </section>
        </div>
      ) : null}
    </section>
  );
}
