"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Copy,
  Download,
  Edit3,
  Eye,
  FileCode2,
  Grid2X2,
  List,
  LoaderCircle,
  PanelLeft,
  RefreshCw,
  Search,
  Share2,
  Trash2,
  X,
} from "lucide-react";
import { PlatformSelect } from "@/components/platform-select";
import { Pagination } from "@/components/pagination";
import { SuccessMessage } from "@/components/success-message";
import { ConfirmDialog } from "@/components/confirm-dialog";
import {
  PrototypeUploadPicker,
  PrototypeUploadProgressBar,
  type PrototypeUploadSelection,
} from "@/components/prototype-upload-picker";
import { copyText } from "@/lib/client-clipboard";
import { withBasePath } from "@/lib/app-path";
import { toDatetimeLocalValue } from "@/lib/datetime-local";
import { formatShareDetails } from "@/lib/share-details";
import {
  appendPrototypeUpload,
  FOLDER_PACKING_COMPLETE_PERCENT,
  uploadPrototypeForm,
  type PrototypeUploadProgress,
} from "@/lib/prototype-upload-client";
import type {
  BusinessCategory,
  Department,
  PrototypeProject,
} from "@/lib/types";

type Dialog = "edit" | "update" | "public" | "share" | null;

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function descendantIds(departments: Department[], root: string) {
  const ids = new Set([root]);
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

export function AdminProjectsWorkspace({
  initialProjects,
  departments,
  categories,
  demoUrl,
  canManage,
}: {
  initialProjects: PrototypeProject[];
  departments: Department[];
  categories: BusinessCategory[];
  demoUrl: string;
  canManage: boolean;
}) {
  const router = useRouter();
  const [projects, setProjects] = useState(initialProjects);
  const [projectsSource, setProjectsSource] = useState(initialProjects);
  const [departmentId, setDepartmentId] = useState(departments[0]?.id ?? "");
  const [view, setView] = useState<"card" | "list">("card");
  const [page, setPage] = useState(1);
  const [cardPageSize, setCardPageSize] = useState(12);
  const [listPageSize, setListPageSize] = useState(20);
  const [search, setSearch] = useState("");
  const [dialog, setDialog] = useState<Dialog>(null);
  const [active, setActiveState] = useState<PrototypeProject | null>(null);
  const activeRef = useRef<PrototypeProject | null>(null);
  const [name, setName] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [publicEnabled, setPublicEnabled] = useState(false);
  const [shareEnabled, setShareEnabled] = useState(false);
  const [expiresAt, setExpiresAt] = useState("");
  const [password, setPassword] = useState("");
  const [uploadSelection, setUploadSelection] = useState<PrototypeUploadSelection | null>(null);
  const [uploadProgress, setUploadProgress] = useState<PrototypeUploadProgress | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [mobileDepartmentsOpen, setMobileDepartmentsOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<PrototypeProject | null>(null);

  const pendingPreviewIds = projects
    .filter((project) => project.previewStatus === "pending")
    .map((project) => project.id)
    .sort()
    .join(",");

  if (projectsSource !== initialProjects) {
    setProjectsSource(initialProjects);
    setProjects(initialProjects);
  }

  useEffect(() => {
    const refreshVisits = () => router.refresh();
    window.addEventListener("focus", refreshVisits);
    return () => window.removeEventListener("focus", refreshVisits);
  }, [router]);

  useEffect(() => {
    if (!pendingPreviewIds) return;
    const ids = pendingPreviewIds.split(",");
    let stopped = false;
    let attempts = 0;

    const refreshPreviews = async () => {
      attempts += 1;
      const results = await Promise.all(ids.map(async (id) => {
        const response = await fetch(withBasePath(`/api/projects/${id}/preview`), { cache: "no-store" });
        if (!response.ok) return null;
        const body = await response.json();
        return { id, ...body.preview } as {
          id: string;
          status: PrototypeProject["previewStatus"];
          url: string | null;
          error: string | null;
          size: number;
          updatedAt: string;
        };
      }));
      if (stopped) return;
      const byId = new Map(results.filter((item) => item).map((item) => [item!.id, item!]));
      setProjects((items) => items.map((project) => {
        const preview = byId.get(project.id);
        if (!preview) return project;
        return {
          ...project,
          previewStatus: preview.status,
          previewUrl: preview.url,
          previewError: preview.error,
          previewSize: preview.size,
          updatedAt: preview.updatedAt,
        };
      }));
      if (attempts >= 24) window.clearInterval(timer);
    };

    const timer = window.setInterval(() => void refreshPreviews(), 2500);
    void refreshPreviews();
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [pendingPreviewIds]);

  function setActive(project: PrototypeProject | null) {
    activeRef.current = project;
    setActiveState(project);
  }

  const visible = useMemo(() => {
    const deptIds = departmentId
      ? descendantIds(departments, departmentId)
      : new Set(departments.map((item) => item.id));
    return projects
      .filter((project) => deptIds.has(project.departmentId))
      .filter((project) =>
        project.name.toLowerCase().includes(search.trim().toLowerCase()),
      );
  }, [departmentId, departments, projects, search]);
  const pageSize = view === "card" ? cardPageSize : listPageSize;
  const pageCount = Math.max(1, Math.ceil(visible.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const pagedProjects = visible.slice((safePage - 1) * pageSize, safePage * pageSize);
  const downloadUrl = (project: PrototypeProject) => withBasePath(`/api/projects/${project.id}/download`);

  function open(project: PrototypeProject, next: Dialog) {
    setActive(project);
    setDialog(next);
    setError("");
    setName(project.name);
    setCategoryId(project.categoryId ?? "");
    setPublicEnabled(project.isPublic);
    setShareEnabled(project.shareEnabled);
    setExpiresAt(toDatetimeLocalValue(project.shareExpiresAt));
    setPassword(project.sharePassword ?? "");
    setUploadSelection(null);
    setUploadProgress(null);
  }

  async function patch(
    changes: Record<string, unknown>,
    target = activeRef.current,
  ) {
    if (!target) return false;
    setLoading(true);
    const response = await fetch(withBasePath(`/api/projects/${target.id}`), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(changes),
    });
    const result = await response.json();
    setLoading(false);
    if (!response.ok) {
      setError(result.message ?? "保存失败");
      return false;
    }
    setProjects((items) =>
      items.map((item) =>
        item.id === target.id
          ? (result.project ?? {
              ...item,
              ...changes,
              updatedAt: new Date().toISOString(),
            })
          : item,
      ),
    );
    setDialog(null);
    setMessage("原型信息已保存");
    router.refresh();
    return (result.project ?? target) as PrototypeProject;
  }

  async function saveShare() {
    if (!active) return;
    const saved = await patch({
      shareEnabled,
      shareExpiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
      ...(shareEnabled ? { sharePassword: password } : {}),
    });
    if (!saved) return;
    if (!shareEnabled) return setMessage("分享已关闭");
    const savedProject = saved as PrototypeProject;
    if (await copyText(formatShareDetails(savedProject, `${demoUrl}/share/${savedProject.shareCode}/`))) {
      setMessage(savedProject.sharePassword ? "分享链接和密码已自动复制" : "分享链接已自动复制");
    } else {
      setMessage("分享已保存，但浏览器未授权自动复制");
    }
  }

  async function savePublic() {
    if (!active) return;
    if (publicEnabled && !categoryId) return setError("请选择业务分类");
    const saved = await patch({
      isPublic: publicEnabled,
      ...(publicEnabled ? { categoryId } : {}),
    });
    if (saved) setMessage(publicEnabled ? "已公开到广场" : "已取消公开");
  }

  async function updateFile() {
    if (!active || !uploadSelection) return;
    setLoading(true);
    try {
      const form = new FormData();
      setUploadProgress({
        phase: uploadSelection.kind === "folder" ? "packing" : "uploading",
        percent: 0,
      });
      await appendPrototypeUpload(form, uploadSelection, setUploadProgress);
      form.set("name", active.name);
      const result = await uploadPrototypeForm<{ project: PrototypeProject }>(
        withBasePath(`/api/projects/${active.id}/file`),
        form,
        setUploadProgress,
        uploadSelection.kind === "folder" ? FOLDER_PACKING_COMPLETE_PERCENT : 0,
      );
      setProjects((items) =>
        items.map((item) => (item.id === active.id ? result.project : item)),
      );
      setDialog(null);
      setMessage("原型已更新");
      router.refresh();
    } catch (cause) {
      setUploadProgress(null);
      setError(cause instanceof Error ? cause.message : "更新失败");
    } finally {
      setLoading(false);
    }
  }

  async function remove(project: PrototypeProject) {
    const response = await fetch(withBasePath(`/api/projects/${project.id}`), {
      method: "DELETE",
    });
    if (response.ok) {
      setProjects((items) => items.filter((item) => item.id !== project.id));
      setDeleteTarget(null);
      setMessage("原型已删除");
    } else {
      setDeleteTarget(null);
      setError((await response.json()).message ?? "删除失败");
    }
  }

  async function retryPreview(project: PrototypeProject) {
    setProjects((items) => items.map((item) => item.id === project.id
      ? { ...item, previewStatus: "pending", previewError: null }
      : item));
    const response = await fetch(withBasePath(`/api/projects/${project.id}/preview`), { method: "POST" });
    if (!response.ok) {
      const result = await response.json();
      setProjects((items) => items.map((item) => item.id === project.id
        ? { ...item, previewStatus: "failed" }
        : item));
      setError(result.message ?? "预览图重试失败");
    } else {
      setMessage("预览图已重新加入生成队列");
    }
  }

  async function copyShare(project: PrototypeProject) {
    if (!project.shareEnabled) return;
    if (await copyText(formatShareDetails(project, `${demoUrl}/share/${project.shareCode}/`))) {
      setMessage(project.sharePassword ? "分享链接和密码已复制" : "分享链接已复制");
    } else {
      setMessage("浏览器未授权复制，请在分享弹窗中查看");
    }
  }

  async function copyCurrentShareDetails() {
    if (!active) return;
    const details = formatShareDetails({
      ...active,
      sharePassword: password,
      shareExpiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
    }, `${demoUrl}/share/${active.shareCode}/`);
    if (await copyText(details)) setMessage("分享信息已复制");
    else setError("浏览器未授权复制，请手动选择分享信息");
  }

  function renderDepartments(
    parent: string | null,
    depth = 0,
  ): React.ReactNode {
    return departments
      .filter(
        (item) =>
          item.parentId === parent ||
          (parent === null &&
            item.parentId &&
            !departments.some((entry) => entry.id === item.parentId)),
      )
      .map((item) => (
        <div key={item.id}>
          <button
            className={`admin-dept-item${departmentId === item.id ? " is-active" : ""}`}
            style={{ paddingLeft: 12 + depth * 16 }}
            onClick={() => {
              setDepartmentId(item.id);
              setPage(1);
              setMobileDepartmentsOpen(false);
            }}
          >
            <span>{item.name}</span>
            <b>
              {projects.filter((project) =>
                descendantIds(departments, item.id).has(project.departmentId),
              ).length}
            </b>
          </button>
          {renderDepartments(item.id, depth + 1)}
        </div>
      ));
  }

  return (
    <section className="admin-projects-layout">
      <SuccessMessage message={message} onClose={() => setMessage("")} />
      <aside className={`admin-project-depts mobile-context-panel${mobileDepartmentsOpen ? " is-open" : ""}`} id="admin-project-department-panel">
        <header>部门范围</header>
        {renderDepartments(null)}
      </aside>
      <button className={`mobile-context-backdrop${mobileDepartmentsOpen ? " is-open" : ""}`} type="button" aria-label="关闭部门范围" tabIndex={mobileDepartmentsOpen ? 0 : -1} onClick={() => setMobileDepartmentsOpen(false)} />
      <div className="admin-project-main">
        <header className="projects-toolbar">
          <div>
            <h1>部门原型</h1>
          </div>
          <div className="projects-toolbar-actions">
            <button className="ui-button mobile-context-trigger" type="button" aria-controls="admin-project-department-panel" aria-expanded={mobileDepartmentsOpen} onClick={() => setMobileDepartmentsOpen(true)}><PanelLeft size={16} />部门</button>
            <label className="search-box">
              <input
                className="ui-input"
                value={search}
                onChange={(event) => { setSearch(event.target.value); setPage(1); }}
                placeholder="搜索原型"
              />
              <Search size={15} />
            </label>
            <span className="view-segment">
              <button
                className={view === "card" ? "is-active" : ""}
                title="卡片视图"
                onClick={() => { setView("card"); setPage(1); }}
              >
                <Grid2X2 size={16} />
              </button>
              <button
                className={view === "list" ? "is-active" : ""}
                title="列表视图"
                onClick={() => { setView("list"); setPage(1); }}
              >
                <List size={16} />
              </button>
            </span>
          </div>
        </header>
        {error && !dialog ? <div className="inline-error">{error}</div> : null}
        <div className="projects-results">
        {visible.length === 0 ? (
          <div className="empty-state"><FileCode2 size={42} /><b>暂无部门原型</b><p>当前部门范围内没有符合条件的原型</p></div>
        ) : view === "card" ? (
          <div className="prototype-grid">
            {pagedProjects.map((project, index) => (
              <article className="prototype-card" key={project.id} role="link" tabIndex={0} aria-label={`打开原型 ${project.name}`} onClick={(event) => { if (!(event.target as HTMLElement).closest("a, button")) window.open(`${demoUrl}/project/${project.publicCode}/`, "_blank", "noopener,noreferrer"); }} onKeyDown={(event) => { if (event.key === "Enter") window.open(`${demoUrl}/project/${project.publicCode}/`, "_blank", "noopener,noreferrer"); }}>
                <a
                  className="prototype-preview"
                  href={`${demoUrl}/project/${project.publicCode}/`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {project.previewUrl ? (
                    <Image
                      src={project.previewUrl}
                      fill
                      sizes="360px"
                      loading={index < 12 ? "eager" : "lazy"}
                      unoptimized
                      alt={`${project.name}首页预览`}
                    />
                  ) : (
                    <span className={`preview-loading${project.previewStatus === "failed" ? " is-failed" : ""}`}>
                      <LoaderCircle size={28} />
                      {project.previewStatus === "failed" ? "预览图生成失败" : "预览图生成中"}
                    </span>
                  )}
                  <i>
                    <Eye size={14} />
                    {project.visitCount}
                  </i>
                </a>
                <div className="prototype-card-body">
                  <div className="prototype-title-row">
                    <a className="prototype-name" href={`${demoUrl}/project/${project.publicCode}/`} target="_blank" rel="noreferrer">{project.name}</a>
                    <span className="prototype-title-tags">
                      <span className={`status-tag${project.shareEnabled ? " status-tag-primary" : ""}`}>{project.shareEnabled ? "已共享" : "未共享"}</span>
                      <span className={`status-tag${project.isPublic ? " status-tag-success" : ""}`}>{project.isPublic ? "已公开" : "未公开"}</span>
                    </span>
                  </div>
                  <div className="prototype-meta">
                    <span>
                      {project.ownerName} · {project.departmentName}
                    </span>
                    <span>{formatDate(project.updatedAt)} 更新</span>
                  </div>
                </div>
                {canManage ? <div className={`prototype-actions${project.previewStatus === "failed" ? " is-dense" : ""}`}>
                  <button type="button" title="编辑" aria-label="编辑" onClick={() => open(project, "edit")}>
                    <Edit3 size={16} /><span className="action-label">编辑</span>
                  </button>
                  <button type="button" title="更新" aria-label="更新" onClick={() => open(project, "update")}>
                    <RefreshCw size={16} /><span className="action-label">更新</span>
                  </button>
                  <button type="button" title="公开" aria-label="公开" onClick={() => open(project, "public")}>
                    <Eye size={16} /><span className="action-label">公开</span>
                  </button>
                  <button type="button" title="分享" aria-label="分享" onClick={() => open(project, "share")}>
                    <Share2 size={16} /><span className="action-label">分享</span>
                  </button>
                  <button type="button" title="下载原型" aria-label="下载原型" onClick={() => window.location.assign(downloadUrl(project))}>
                    <Download size={16} /><span className="action-label">下载</span>
                  </button>
                  {project.previewStatus === "failed" ? (
                    <button type="button" title="重新生成预览图" aria-label="重新生成预览图" onClick={() => void retryPreview(project)}>
                      <RefreshCw size={16} /><span className="action-label">重试</span>
                    </button>
                  ) : null}
                  <button
                    className="danger"
                    type="button"
                    title="删除原型"
                    aria-label={`删除原型 ${project.name}`}
                    onClick={() => setDeleteTarget(project)}
                  >
                    <Trash2 size={16} /><span className="action-label">删除</span>
                  </button>
                </div> : null}
              </article>
            ))}
          </div>
        ) : (
          <div className="data-table-wrap">
            <table className="data-table admin-project-table responsive-table">
              <thead>
                <tr>
                  <th className="serial-column">序号</th>
                  <th>原型</th>
                  <th>负责人</th>
                  <th>部门</th>
                  <th>公开</th>
                  <th>分享</th>
                  <th>访问量</th>
                  <th>更新时间</th>
                  {canManage ? <th>操作</th> : null}
                </tr>
              </thead>
              <tbody>
                {pagedProjects.map((project, index) => (
                  <tr key={project.id}>
                    <td>{(safePage - 1) * pageSize + index + 1}</td>
                    <td>
                      <a
                        className="table-link"
                        href={`${demoUrl}/project/${project.publicCode}/`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {project.name}
                      </a>
                    </td>
                    <td>{project.ownerName}</td>
                    <td>{project.departmentName}</td>
                    <td>
                      {project.isPublic ? project.categoryName : "未公开"}
                    </td>
                    <td>{project.shareEnabled ? (canManage ? <span className="table-share-cell"><a className="table-share-link" href={`${demoUrl}/share/${project.shareCode}/`} target="_blank" rel="noreferrer" title={`${demoUrl}/share/${project.shareCode}/`}><Share2 size={13} /><span>{demoUrl}/share/{project.shareCode}/</span></a><button className="icon-button table-copy-share" type="button" title="复制分享链接和密码" onClick={() => void copyShare(project)}><Copy size={14} /></button></span> : "已开启") : "已关闭"}</td>
                    <td>{project.visitCount}</td>
                    <td>{formatDate(project.updatedAt)}</td>
                    {canManage ? <td>
                      <div className="table-actions">
                        <button
                          className="icon-button"
                          title="编辑"
                          onClick={() => open(project, "edit")}
                        >
                          <Edit3 size={16} />
                        </button>
                        <button
                          className="icon-button"
                          title="更新"
                          onClick={() => open(project, "update")}
                        >
                          <RefreshCw size={16} />
                        </button>
                        <button
                          className="icon-button"
                          title="公开"
                          onClick={() => open(project, "public")}
                        >
                          <Eye size={16} />
                        </button>
                        <button
                          className="icon-button"
                          title="分享"
                          onClick={() => open(project, "share")}
                        >
                          <Share2 size={16} />
                        </button>
                        <button
                          className="icon-button"
                          title="下载原型"
                          onClick={() => window.location.assign(downloadUrl(project))}
                        >
                          <Download size={16} />
                        </button>
                        {project.previewStatus === "failed" ? (
                          <button className="icon-button" title="重新生成预览图" onClick={() => void retryPreview(project)}>
                            <RefreshCw size={16} />
                          </button>
                        ) : null}
                        <button
                          className="icon-button danger"
                          title="删除"
                          onClick={() => setDeleteTarget(project)}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td> : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        </div>
        {visible.length ? <Pagination total={visible.length} page={safePage} pageSize={pageSize} pageSizeOptions={view === "card" ? [12, 24, 48] : [20, 50, 100]} onPageChange={setPage} onPageSizeChange={(value) => { if (view === "card") setCardPageSize(value); else setListPageSize(value); setPage(1); }} /> : null}
      </div>

      <ConfirmDialog open={Boolean(deleteTarget)} title={deleteTarget ? `删除“${deleteTarget.name}”？` : "删除原型？"} description="原型文件、预览和分享入口将一并删除，此操作无法恢复。" onCancel={() => setDeleteTarget(null)} onConfirm={() => { if (deleteTarget) void remove(deleteTarget); }} />

      {dialog && active ? (
        <div className="modal-backdrop">
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-project-dialog-title"
          >
            <header className="modal-header">
              <h2 className="modal-title" id="admin-project-dialog-title">
                {dialog === "edit"
                  ? "编辑原型"
                  : dialog === "update"
                    ? "更新原型"
                    : dialog === "public"
                      ? "公开设置"
                      : "分享设置"}
              </h2>
              <button className="icon-button" type="button" aria-label="关闭" onClick={() => setDialog(null)}>
                <X size={18} />
              </button>
            </header>
            <div className="modal-body">
              <div className="dialog-form">
                {dialog === "edit" ? (
                  <label className="form-field">
                    <span className="form-label">名称</span>
                    <input
                      className="ui-input"
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                    />
                  </label>
                ) : dialog === "update" ? (
                  <>
                    <PrototypeUploadPicker disabled={loading} selection={uploadSelection} onError={setError} onChange={setUploadSelection} />
                    {uploadProgress ? <PrototypeUploadProgressBar progress={uploadProgress} /> : null}
                    <div className="replace-note">
                      <RefreshCw size={16} />
                      更新成功后删除旧文件，不保留历史版本。
                    </div>
                  </>
                ) : dialog === "public" ? (
                  <>
                    <div className="share-switch-row">
                      <div>
                        <b>公开到广场</b>
                        <p>开启后，所有已登录人员均可在公开广场访问。</p>
                      </div>
                      <button
                        className={`toggle-switch${publicEnabled ? " is-on" : ""}`}
                        type="button"
                        role="switch"
                        aria-label="公开到广场"
                        aria-checked={publicEnabled}
                        onClick={() => setPublicEnabled((value) => !value)}
                      />
                    </div>
                    {publicEnabled ? (
                      <label className="form-field">
                        <span className="form-label form-label-required">业务分类</span>
                        <PlatformSelect
                          value={categoryId}
                          onChange={setCategoryId}
                          placeholder="请选择分类"
                          options={categories
                            .filter((item) => item.enabled)
                            .map((item) => ({ value: item.id, label: item.name }))}
                        />
                      </label>
                    ) : null}
                  </>
                ) : (
                  <>
                    <div className="share-switch-row">
                      <div>
                        <b>开启分享链接</b>
                        <p>开启后，获得分享链接的人员可访问原型。</p>
                      </div>
                      <button
                        className={`toggle-switch${shareEnabled ? " is-on" : ""}`}
                        type="button"
                        role="switch"
                        aria-label="开启分享"
                        aria-checked={shareEnabled}
                        onClick={() => setShareEnabled((value) => !value)}
                      />
                    </div>
                    {shareEnabled ? <>
                    <label className="form-field">
                      <span className="form-label">截止时间</span>
                      <input
                        className="ui-input"
                        type="datetime-local"
                        value={expiresAt}
                        onChange={(event) => setExpiresAt(event.target.value)}
                      />
                    </label>
                    <label className="form-field">
                      <span className="form-label">访问密码</span>
                      <input
                        className="ui-input"
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        placeholder="留空表示无需密码"
                      />
                    </label>
                    <div className="form-field">
                      <span className="share-details-heading"><span className="form-label">分享信息</span><button className="icon-button" type="button" title="复制分享信息" aria-label="复制分享信息" onClick={() => void copyCurrentShareDetails()}><Copy size={15} /></button></span>
                      <pre className="share-details-preview">{formatShareDetails({ ...active, sharePassword: password, shareExpiresAt: expiresAt ? new Date(expiresAt).toISOString() : null }, `${demoUrl}/share/${active.shareCode}/`)}</pre>
                    </div>
                    </> : null}
                  </>
                )}
                {error ? <div className="field-error">{error}</div> : null}
              </div>
            </div>
            <footer className="modal-footer">
              <button className="ui-button" onClick={() => setDialog(null)}>
                取消
              </button>
              <button
                className="ui-button ui-button-primary"
                disabled={loading || (dialog === "update" && !uploadSelection)}
                onClick={() =>
                  dialog === "edit"
                    ? void patch({ name })
                    : dialog === "update"
                      ? void updateFile()
                      : dialog === "public"
                        ? void savePublic()
                        : void saveShare()
                }
              >
                {loading ? "处理中..." : "确认"}
              </button>
            </footer>
          </section>
        </div>
      ) : null}
    </section>
  );
}
