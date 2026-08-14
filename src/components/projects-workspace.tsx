"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  ChevronRight,
  Copy,
  Download,
  Edit3,
  Eye,
  FileCode2,
  Folder,
  FolderPlus,
  Grid2X2,
  List,
  LoaderCircle,
  PanelLeft,
  Plus,
  RefreshCw,
  Search,
  Share2,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";
import { PlatformSelect, PlatformTreeSelect } from "@/components/platform-select";
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
import type { BusinessCategory, PrototypeGroup, PrototypeProject } from "@/lib/types";

type Dialog = "upload" | "edit" | "share" | "public" | "group" | null;
type DeleteTarget = { type: "group"; item: PrototypeGroup } | { type: "project"; item: PrototypeProject };

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatBytes(value: number) {
  if (value < 1024 * 1024) return `${Math.ceil(value / 1024)}KB`;
  return `${(value / 1024 / 1024).toFixed(1)}MB`;
}

function Modal({ title, children, onClose, footer, wide = false }: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  footer: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className={`modal${wide ? " modal-wide" : ""}`} role="dialog" aria-modal="true">
        <header className="modal-header">
          <h2 className="modal-title">{title}</h2>
          <button className="icon-button" type="button" title="关闭" onClick={onClose}><X size={18} /></button>
        </header>
        <div className="modal-body">{children}</div>
        <footer className="modal-footer">{footer}</footer>
      </section>
    </div>
  );
}

export function ProjectsWorkspace({
  initialProjects,
  initialGroups,
  categories,
  demoUrl,
  storageBytes,
  storageLimitBytes,
}: {
  initialProjects: PrototypeProject[];
  initialGroups: PrototypeGroup[];
  categories: BusinessCategory[];
  demoUrl: string;
  storageBytes: number;
  storageLimitBytes: number;
}) {
  const router = useRouter();
  const [projects, setProjects] = useState(initialProjects);
  const [projectsSource, setProjectsSource] = useState(initialProjects);
  const [groups, setGroups] = useState(initialGroups);
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [view, setView] = useState<"card" | "list">("card");
  const [page, setPage] = useState(1);
  const [cardPageSize, setCardPageSize] = useState(12);
  const [listPageSize, setListPageSize] = useState(20);
  const [search, setSearch] = useState("");
  const [dialog, setDialog] = useState<Dialog>(null);
  const [activeProject, setActiveProject] = useState<PrototypeProject | null>(null);
  const [uploadSelection, setUploadSelection] = useState<PrototypeUploadSelection | null>(null);
  const [uploadProgress, setUploadProgress] = useState<PrototypeUploadProgress | null>(null);
  const [name, setName] = useState("");
  const [groupId, setGroupId] = useState<string>("");
  const [categoryId, setCategoryId] = useState<string>("");
  const [publicEnabled, setPublicEnabled] = useState(false);
  const [shareEnabled, setShareEnabled] = useState(false);
  const [shareExpiresAt, setShareExpiresAt] = useState("");
  const [sharePassword, setSharePassword] = useState("");
  const [groupName, setGroupName] = useState("");
  const [groupParentId, setGroupParentId] = useState("");
  const [activeGroup, setActiveGroup] = useState<PrototypeGroup | null>(null);
  const [expandedGroups, setExpandedGroups] = useState(
    () => new Set(initialGroups.map((group) => group.id)),
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [mobileGroupsOpen, setMobileGroupsOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);

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

  const filteredProjects = useMemo(
    () => {
      const selectedIds = selectedGroup ? new Set([selectedGroup]) : null;
      if (selectedIds) {
        let changed = true;
        while (changed) {
          changed = false;
          groups.forEach((group) => {
            if (group.parentId && selectedIds.has(group.parentId) && !selectedIds.has(group.id)) {
              selectedIds.add(group.id);
              changed = true;
            }
          });
        }
      }
      return projects.filter((project) => {
      const matchesGroup = !selectedIds || Boolean(project.groupId && selectedIds.has(project.groupId));
      const keyword = search.trim().toLowerCase();
      return matchesGroup && (!keyword || project.name.toLowerCase().includes(keyword));
      });
    },
    [groups, projects, search, selectedGroup],
  );
  const pageSize = view === "card" ? cardPageSize : listPageSize;
  const pageCount = Math.max(1, Math.ceil(filteredProjects.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const pagedProjects = filteredProjects.slice((safePage - 1) * pageSize, safePage * pageSize);

  const resetDialog = () => {
    setDialog(null);
    setError("");
    setUploadSelection(null);
    setUploadProgress(null);
    setActiveProject(null);
    setActiveGroup(null);
  };

  const closeDialog = () => {
    if (loading) return;
    resetDialog();
  };

  function openUpload(project?: PrototypeProject) {
    setActiveProject(project ?? null);
    setName(project?.name ?? "");
    setGroupId(project?.groupId ?? selectedGroup ?? "");
    setUploadSelection(null);
    setUploadProgress(null);
    setError("");
    setDialog("upload");
  }

  function openEdit(project: PrototypeProject) {
    setActiveProject(project);
    setName(project.name);
    setGroupId(project.groupId ?? "");
    setDialog("edit");
  }

  function openShare(project: PrototypeProject) {
    setActiveProject(project);
    setShareEnabled(project.shareEnabled);
    setShareExpiresAt(toDatetimeLocalValue(project.shareExpiresAt));
    setSharePassword(project.sharePassword ?? "");
    setDialog("share");
  }

  function openPublic(project: PrototypeProject) {
    setActiveProject(project);
    setPublicEnabled(project.isPublic);
    setCategoryId(project.categoryId ?? "");
    setError("");
    setDialog("public");
  }

  async function uploadSelected() {
    if (!uploadSelection) return setError("请选择 HTML、ZIP、RAR 或项目文件夹");
    const updating = Boolean(activeProject);
    setLoading(true);
    setError("");
    try {
      const endpoint = withBasePath(activeProject ? `/api/projects/${activeProject.id}/file` : "/api/projects");
      const form = new FormData();
      setUploadProgress({
        phase: uploadSelection.kind === "folder" ? "packing" : "uploading",
        percent: 0,
      });
      await appendPrototypeUpload(form, uploadSelection, setUploadProgress);
      if (name.trim()) form.set("name", name.trim());
      if (groupId) form.set("groupId", groupId);
      const result = await uploadPrototypeForm<{ project: PrototypeProject }>(
        endpoint,
        form,
        setUploadProgress,
        uploadSelection.kind === "folder" ? FOLDER_PACKING_COMPLETE_PERCENT : 0,
      );
      if (activeProject) {
        setProjects((items) => items.map((item) => item.id === result.project.id ? result.project : item));
      } else {
        setProjects((items) => [result.project, ...items]);
      }
      resetDialog();
      setMessage(updating ? "原型已更新" : "原型已上传");
      router.refresh();
    } catch (cause) {
      setUploadProgress(null);
      setError(cause instanceof Error ? cause.message : "上传失败");
    } finally {
      setLoading(false);
    }
  }

  async function updateProject(project: PrototypeProject, changes: Record<string, unknown>) {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(withBasePath(`/api/projects/${project.id}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(changes),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message ?? "保存失败");
      setProjects((items) => items.map((item) => {
        if (item.id !== project.id) return item;
        if (result.project) return result.project;
        return { ...item, ...changes, updatedAt: new Date().toISOString() } as PrototypeProject;
      }));
      setDialog(null);
      router.refresh();
      return (result.project ?? null) as PrototypeProject | null;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "保存失败");
    } finally {
      setLoading(false);
    }
    return null;
  }

  async function saveEdit() {
    if (!activeProject) return;
    const saved = await updateProject(activeProject, { name, groupId: groupId || null });
    if (saved) setMessage("原型信息已保存");
  }

  async function savePublic() {
    if (!activeProject) return;
    if (publicEnabled && !categoryId) return setError("请选择业务分类");
    const saved = await updateProject(activeProject, {
      isPublic: publicEnabled,
      ...(publicEnabled ? { categoryId } : {}),
    });
    if (saved) setMessage(publicEnabled ? "已公开到广场" : "已取消公开");
  }

  async function saveShare() {
    if (!activeProject) return;
    const changes: Record<string, unknown> = {
      shareEnabled,
      shareExpiresAt: shareExpiresAt ? new Date(shareExpiresAt).toISOString() : null,
    };
    if (shareEnabled) changes.sharePassword = sharePassword;
    const saved = await updateProject(activeProject, changes);
    if (!saved) return;
    if (!shareEnabled) {
      setMessage("分享已关闭");
      return;
    }
    if (await copyText(formatShareDetails(saved, shareUrl(saved)))) {
      setMessage(saved.sharePassword ? "分享链接和密码已自动复制" : "分享链接已自动复制");
    } else {
      setMessage("分享已保存，但浏览器未授权自动复制");
    }
  }

  async function saveGroup() {
    if (!groupName.trim()) return setError("请输入分组名称");
    setLoading(true);
    const response = await fetch(withBasePath(activeGroup ? `/api/groups/${activeGroup.id}` : "/api/groups"), {
      method: activeGroup ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: groupName, parentId: groupParentId || null }),
    });
    const result = await response.json();
    setLoading(false);
    if (!response.ok) return setError(result.message ?? "保存失败");
    setGroups((items) => activeGroup
      ? items.map((item) => item.id === activeGroup.id ? { ...item, ...result.group } : item)
      : [...items, result.group]);
    setExpandedGroups((items) => new Set([...items, groupParentId].filter(Boolean)));
    setGroupName("");
    setActiveGroup(null);
    setDialog(null);
    setMessage(activeGroup ? "分组信息已保存" : "分组已新增");
  }

  async function removeGroup(group: PrototypeGroup) {
    const response = await fetch(withBasePath(`/api/groups/${group.id}`), { method: "DELETE" });
    const result = await response.json();
    if (!response.ok) {
      setDeleteTarget(null);
      return setError(result.message ?? "删除失败");
    }
    setGroups((items) => items.filter((item) => item.id !== group.id));
    if (selectedGroup === group.id) setSelectedGroup(null);
    setDeleteTarget(null);
    setMessage("分组已删除");
  }

  async function removeProject(project: PrototypeProject) {
    const response = await fetch(withBasePath(`/api/projects/${project.id}`), { method: "DELETE" });
    if (response.ok) {
      setProjects((items) => items.filter((item) => item.id !== project.id));
      setDeleteTarget(null);
      setMessage("原型已删除");
    }
    else {
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

  const projectUrl = (project: PrototypeProject) => `${demoUrl}/project/${project.publicCode}/`;
  const shareUrl = (project: PrototypeProject) => `${demoUrl}/share/${project.shareCode}/`;
  const downloadUrl = (project: PrototypeProject) => withBasePath(`/api/projects/${project.id}/download`);
  const usagePercent = Math.min(100, (storageBytes / storageLimitBytes) * 100);

  async function copyShare(project: PrototypeProject) {
    if (!project.shareEnabled) return;
    if (await copyText(formatShareDetails(project, shareUrl(project)))) {
      setMessage(project.sharePassword ? "分享链接和密码已复制" : "分享链接已复制");
    } else {
      setMessage("浏览器未授权复制，请在分享弹窗中查看");
    }
  }

  async function copyCurrentShareDetails() {
    if (!activeProject) return;
    const details = formatShareDetails({
      ...activeProject,
      sharePassword,
      shareExpiresAt: shareExpiresAt ? new Date(shareExpiresAt).toISOString() : null,
    }, shareUrl(activeProject));
    if (await copyText(details)) setMessage("分享信息已复制");
    else setError("浏览器未授权复制，请手动选择分享信息");
  }

  function openGroupDialog(group?: PrototypeGroup, parentId?: string) {
    setActiveGroup(group ?? null);
    setGroupName(group?.name ?? "");
    setGroupParentId(group ? group.parentId ?? "" : parentId ?? selectedGroup ?? "");
    setError("");
    setDialog("group");
  }

  function groupDescendantIds(rootId: string) {
    const ids = new Set([rootId]);
    let changed = true;
    while (changed) {
      changed = false;
      groups.forEach((group) => {
        if (group.parentId && ids.has(group.parentId) && !ids.has(group.id)) {
          ids.add(group.id);
          changed = true;
        }
      });
    }
    return ids;
  }

  function groupProjectCount(rootId: string) {
    const ids = groupDescendantIds(rootId);
    return projects.filter((project) => project.groupId && ids.has(project.groupId)).length;
  }

  function renderGroups(parentId: string | null, depth = 0): React.ReactNode {
    const children = groups.filter((group) =>
      group.parentId === parentId
      || (parentId === null && group.parentId && !groups.some((item) => item.id === group.parentId)),
    );
    return children.map((group) => {
      const hasChildren = groups.some((item) => item.parentId === group.id);
      return (
        <div key={group.id}>
          <div className={`group-tree-row${selectedGroup === group.id ? " is-active" : ""}`} style={{ paddingLeft: 8 + depth * 18 }}>
            <button
              className={`group-toggle${expandedGroups.has(group.id) ? " is-open" : ""}`}
              type="button"
              disabled={!hasChildren}
              title={expandedGroups.has(group.id) ? "收起" : "展开"}
              onClick={() => setExpandedGroups((items) => {
                const next = new Set(items);
                if (next.has(group.id)) next.delete(group.id);
                else next.add(group.id);
                return next;
              })}
            >
              {hasChildren ? <ChevronRight size={13} /> : <span />}
            </button>
            <button className="group-tree-name" type="button" onClick={() => { setSelectedGroup(group.id); setPage(1); setMobileGroupsOpen(false); }}>
              <Folder size={16} />
              <span>{group.name}</span>
              <b>{groupProjectCount(group.id)}</b>
            </button>
            <span className="group-row-actions">
              <button className="icon-button" type="button" title="新增下级分组" onClick={() => openGroupDialog(undefined, group.id)}><FolderPlus size={14} /></button>
              <button className="icon-button" type="button" title="编辑分组" onClick={() => openGroupDialog(group)}><Edit3 size={14} /></button>
              <button className="icon-button danger" type="button" title="删除分组" onClick={() => setDeleteTarget({ type: "group", item: group })}><Trash2 size={14} /></button>
            </span>
          </div>
          {hasChildren && expandedGroups.has(group.id) ? renderGroups(group.id, depth + 1) : null}
        </div>
      );
    });
  }

  return (
    <section className="projects-layout">
      <SuccessMessage message={message} onClose={() => setMessage("")} />
      <aside className={`group-tree mobile-context-panel${mobileGroupsOpen ? " is-open" : ""}`} id="project-group-panel">
        <div className="group-tree-head">
          <span>原型分组</span>
          <button className="icon-button" type="button" title="新增分组" onClick={() => openGroupDialog()}><FolderPlus size={17} /></button>
        </div>
        <div className="group-tree-scroll">
          <button className={`group-item${selectedGroup === null ? " is-active" : ""}`} type="button" onClick={() => { setSelectedGroup(null); setPage(1); setMobileGroupsOpen(false); }}>
            <Folder size={16} /><span>全部原型</span><b>{projects.length}</b>
          </button>
          {renderGroups(null)}
        </div>
        <div className="storage-budget">
          <div><span>存储用量</span><b>{formatBytes(storageBytes)} / {formatBytes(storageLimitBytes)}</b></div>
          <span className="storage-track"><i style={{ width: `${usagePercent}%` }} /></span>
        </div>
      </aside>
      <button className={`mobile-context-backdrop${mobileGroupsOpen ? " is-open" : ""}`} type="button" aria-label="关闭原型分组" tabIndex={mobileGroupsOpen ? 0 : -1} onClick={() => setMobileGroupsOpen(false)} />

      <div className="projects-main">
        <header className="projects-toolbar">
          <div>
            <h1>我的原型</h1>
          </div>
          <div className="projects-toolbar-actions">
            <button className="ui-button mobile-context-trigger" type="button" aria-controls="project-group-panel" aria-expanded={mobileGroupsOpen} onClick={() => setMobileGroupsOpen(true)}><PanelLeft size={16} />分组</button>
            <label className="search-box"><input className="ui-input" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="搜索原型名称" /><Search size={15} /></label>
            <span className="view-segment" aria-label="视图切换">
              <button className={view === "card" ? "is-active" : ""} type="button" title="卡片视图" onClick={() => { setView("card"); setPage(1); }}><Grid2X2 size={16} /></button>
              <button className={view === "list" ? "is-active" : ""} type="button" title="列表视图" onClick={() => { setView("list"); setPage(1); }}><List size={16} /></button>
            </span>
            <button className="ui-button ui-button-primary" type="button" onClick={() => openUpload()}><Plus size={16} />上传原型</button>
          </div>
        </header>

        {error && !dialog ? <div className="inline-error">{error}</div> : null}
        <div className="projects-results">
        {filteredProjects.length === 0 ? (
          <div className="empty-state"><FileCode2 size={42} /><b>暂无原型</b><p>支持 HTML、ZIP、RAR 或项目文件夹</p><button className="ui-button ui-button-primary" type="button" onClick={() => openUpload()}><UploadCloud size={16} />上传原型</button></div>
        ) : view === "card" ? (
          <div className="prototype-grid">
            {pagedProjects.map((project, index) => (
              <article className="prototype-card" key={project.id} role="link" tabIndex={0} aria-label={`打开原型 ${project.name}`} onClick={(event) => { if (!(event.target as HTMLElement).closest("a, button")) window.open(projectUrl(project), "_blank", "noopener,noreferrer"); }} onKeyDown={(event) => { if (event.key === "Enter") window.open(projectUrl(project), "_blank", "noopener,noreferrer"); }}>
                <a className="prototype-preview" href={projectUrl(project)} target="_blank" rel="noreferrer">
                  {project.previewUrl ? <Image src={project.previewUrl} alt={`${project.name}首页预览`} fill sizes="(max-width: 900px) 100vw, 360px" loading={index < 12 ? "eager" : "lazy"} unoptimized /> : <span className={`preview-loading${project.previewStatus === "failed" ? " is-failed" : ""}`}><LoaderCircle size={28} />{project.previewStatus === "failed" ? "预览图生成失败" : "预览图生成中"}</span>}
                  <i><Eye size={14} />{project.visitCount}</i>
                </a>
                <div className="prototype-card-body">
                  <div className="prototype-title-row">
                    <a className="prototype-name" href={projectUrl(project)} target="_blank" rel="noreferrer" title={project.name}>{project.name}</a>
                    <span className="prototype-title-tags">
                      <span className={`status-tag${project.shareEnabled ? " status-tag-primary" : ""}`}>{project.shareEnabled ? "已共享" : "未共享"}</span>
                      <span className={`status-tag${project.isPublic ? " status-tag-success" : ""}`}>{project.isPublic ? "已公开" : "未公开"}</span>
                    </span>
                  </div>
                  <div className="prototype-meta"><span>{project.departmentName}</span><span>{formatDate(project.updatedAt)} 更新</span></div>
                </div>
                <div className={`prototype-actions${project.previewStatus === "failed" ? " is-dense" : ""}`}>
                  <button type="button" title="编辑" aria-label="编辑" onClick={() => openEdit(project)}><Edit3 size={16} /><span className="action-label">编辑</span></button>
                  <button type="button" title="更新" aria-label="更新" onClick={() => openUpload(project)}><RefreshCw size={16} /><span className="action-label">更新</span></button>
                  <button type="button" title="公开" aria-label="公开" onClick={() => openPublic(project)}><Eye size={16} /><span className="action-label">公开</span></button>
                  <button type="button" title="分享" aria-label="分享" onClick={() => openShare(project)}><Share2 size={16} /><span className="action-label">分享</span></button>
                  <button type="button" title="下载原型" aria-label="下载原型" onClick={() => window.location.assign(downloadUrl(project))}><Download size={16} /><span className="action-label">下载</span></button>
                  {project.previewStatus === "failed" ? <button type="button" title="重新生成预览图" aria-label="重新生成预览图" onClick={() => void retryPreview(project)}><RefreshCw size={16} /><span className="action-label">重试</span></button> : null}
                  <button className="danger" type="button" title="删除原型" aria-label={`删除原型 ${project.name}`} onClick={() => setDeleteTarget({ type: "project", item: project })}><Trash2 size={16} /><span className="action-label">删除</span></button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="data-table-wrap"><table className="data-table project-table responsive-table"><thead><tr><th className="serial-column">序号</th><th>原型名称</th><th>分组</th><th>公开</th><th>分享</th><th>访问量</th><th>更新时间</th><th>操作</th></tr></thead><tbody>
            {pagedProjects.map((project, index) => <tr key={project.id}><td>{(safePage - 1) * pageSize + index + 1}</td><td><a className="table-project-name" href={projectUrl(project)} target="_blank" rel="noreferrer"><span className="table-thumb">{project.previewUrl ? <Image src={project.previewUrl} alt="" fill sizes="64px" loading={index < 12 ? "eager" : "lazy"} unoptimized /> : <LoaderCircle className={project.previewStatus === "failed" ? "" : "preview-spinner"} size={18} />}</span><span>{project.name}<small>{project.previewUrl ? formatBytes(project.fileSize) : project.previewStatus === "failed" ? "预览图生成失败" : "预览图生成中"}</small></span></a></td><td>{groups.find((item) => item.id === project.groupId)?.name ?? "未分组"}</td><td><span className={`status-dot${project.isPublic ? " is-on" : ""}`}>{project.isPublic ? project.categoryName : "未公开"}</span></td><td>{project.shareEnabled ? <span className="table-share-cell"><a className="table-share-link" href={shareUrl(project)} target="_blank" rel="noreferrer" title={shareUrl(project)}><Share2 size={13} /><span>{shareUrl(project)}</span></a><button className="icon-button table-copy-share" type="button" title="复制分享链接和密码" onClick={() => void copyShare(project)}><Copy size={14} /></button></span> : <span className="status-dot">已关闭</span>}</td><td>{project.visitCount}</td><td>{formatDate(project.updatedAt)}</td><td><div className="table-actions"><button className="icon-button" title="编辑" onClick={() => openEdit(project)}><Edit3 size={16} /></button><button className="icon-button" title="更新" onClick={() => openUpload(project)}><RefreshCw size={16} /></button><button className="icon-button" title="公开" onClick={() => openPublic(project)}><Eye size={16} /></button><button className="icon-button" title="分享" onClick={() => openShare(project)}><Share2 size={16} /></button><button className="icon-button" title="下载原型" onClick={() => window.location.assign(downloadUrl(project))}><Download size={16} /></button>{project.previewStatus === "failed" ? <button className="icon-button" title="重新生成预览图" onClick={() => void retryPreview(project)}><RefreshCw size={16} /></button> : null}<button className="icon-button danger" title="删除" onClick={() => setDeleteTarget({ type: "project", item: project })}><Trash2 size={16} /></button></div></td></tr>)}
          </tbody></table></div>
        )}
        </div>
        {filteredProjects.length ? <Pagination total={filteredProjects.length} page={safePage} pageSize={pageSize} pageSizeOptions={view === "card" ? [12, 24, 48] : [20, 50, 100]} onPageChange={setPage} onPageSizeChange={(value) => { if (view === "card") setCardPageSize(value); else setListPageSize(value); setPage(1); }} /> : null}
      </div>

      <ConfirmDialog open={Boolean(deleteTarget)} title={deleteTarget ? `删除“${deleteTarget.item.name}”？` : "确认删除？"} description={deleteTarget?.type === "group" ? "分组删除后无法恢复，请先确认分组内没有原型。" : "原型文件、预览和分享入口将一并删除，此操作无法恢复。"} onCancel={() => setDeleteTarget(null)} onConfirm={() => { if (deleteTarget?.type === "group") void removeGroup(deleteTarget.item); if (deleteTarget?.type === "project") void removeProject(deleteTarget.item); }} />

      {dialog === "upload" ? <Modal title={activeProject ? "更新原型" : "上传原型"} onClose={closeDialog} footer={<><button className="ui-button" onClick={closeDialog}>取消</button><button className="ui-button ui-button-primary" disabled={loading || !uploadSelection} onClick={() => void uploadSelected()}><UploadCloud size={16} />{loading ? "正在处理..." : activeProject ? "确认更新" : "确认上传"}</button></>}>
        <div className="dialog-form">
          <PrototypeUploadPicker disabled={loading} selection={uploadSelection} onError={setError} onChange={(selection) => { setUploadSelection(selection); if (!name.trim()) setName(selection.suggestedName); }} />
          {uploadProgress ? <PrototypeUploadProgressBar progress={uploadProgress} /> : null}
          <label className="form-field"><span className="form-label">原型名称</span><input className="ui-input" value={name} onChange={(event) => setName(event.target.value)} placeholder="留空则使用文件名" maxLength={80} /></label>
          {!activeProject ? <label className="form-field"><span className="form-label">所属分组</span><PlatformTreeSelect value={groupId} onChange={setGroupId} emptyLabel="未分组" nodes={groups.map((group) => ({ id: group.id, label: group.name, parentId: group.parentId }))} /></label> : <div className="replace-note"><RefreshCw size={16} /><span>更新成功后，新文件会直接替换旧文件，旧文件将被删除。</span></div>}
          {error ? <div className="field-error">{error}</div> : null}
        </div>
      </Modal> : null}

      {dialog === "edit" && activeProject ? <Modal title="编辑原型" onClose={closeDialog} footer={<><button className="ui-button" onClick={closeDialog}>取消</button><button className="ui-button ui-button-primary" disabled={loading} onClick={() => void saveEdit()}>{loading ? "保存中..." : "保存"}</button></>}><div className="dialog-form"><label className="form-field"><span className="form-label form-label-required">原型名称</span><input className="ui-input" value={name} onChange={(event) => setName(event.target.value)} maxLength={80} /></label><label className="form-field"><span className="form-label">所属分组</span><PlatformTreeSelect value={groupId} onChange={setGroupId} emptyLabel="未分组" nodes={groups.map((group) => ({ id: group.id, label: group.name, parentId: group.parentId }))} /></label>{error ? <div className="field-error">{error}</div> : null}</div></Modal> : null}

      {dialog === "public" && activeProject ? <Modal title="公开设置" onClose={closeDialog} footer={<><button className="ui-button" onClick={closeDialog}>取消</button><button className="ui-button ui-button-primary" disabled={loading} onClick={() => void savePublic()}>{loading ? "保存中..." : "保存公开设置"}</button></>}><div className="dialog-form"><div className="share-switch-row"><div><b>公开到广场</b><p>开启后，所有已登录人员均可在公开广场访问。</p></div><button className={`toggle-switch${publicEnabled ? " is-on" : ""}`} type="button" role="switch" aria-label="公开到广场" aria-checked={publicEnabled} onClick={() => setPublicEnabled((value) => !value)} /></div>{publicEnabled ? <label className="form-field"><span className="form-label form-label-required">业务分类</span><PlatformSelect value={categoryId} onChange={setCategoryId} placeholder="请选择一级分类" options={categories.filter((item) => item.enabled).map((category) => ({ value: category.id, label: category.name }))} /></label> : null}{error ? <div className="field-error">{error}</div> : null}</div></Modal> : null}

      {dialog === "share" && activeProject ? <Modal title="分享设置" onClose={closeDialog} footer={<><button className="ui-button" onClick={closeDialog}>取消</button><button className="ui-button ui-button-primary" disabled={loading} onClick={() => void saveShare()}>{loading ? "保存中..." : "保存分享设置"}</button></>}><div className="dialog-form"><div className="share-switch-row"><div><b>开启分享链接</b><p>开启后，获得分享链接的人员可访问原型。</p></div><button className={`toggle-switch${shareEnabled ? " is-on" : ""}`} type="button" role="switch" aria-label="开启分享" aria-checked={shareEnabled} onClick={() => setShareEnabled((value) => !value)} /></div>{shareEnabled ? <><label className="form-field"><span className="form-label">截止时间</span><input className="ui-input" type="datetime-local" value={shareExpiresAt} onChange={(event) => setShareExpiresAt(event.target.value)} /><span className="field-help">不填写表示永久有效</span></label><label className="form-field"><span className="form-label">访问密码</span><input className="ui-input" type="text" value={sharePassword} onChange={(event) => setSharePassword(event.target.value)} placeholder="留空表示无需密码" maxLength={64} /></label><div className="form-field"><span className="share-details-heading"><span className="form-label">分享信息</span><button className="icon-button" type="button" title="复制分享信息" aria-label="复制分享信息" onClick={() => void copyCurrentShareDetails()}><Copy size={15} /></button></span><pre className="share-details-preview">{formatShareDetails({ ...activeProject, sharePassword, shareExpiresAt: shareExpiresAt ? new Date(shareExpiresAt).toISOString() : null }, shareUrl(activeProject))}</pre></div></> : null}{error ? <div className="field-error">{error}</div> : null}</div></Modal> : null}

      {dialog === "group" ? <Modal title={activeGroup ? "编辑分组" : "新增分组"} onClose={closeDialog} footer={<><button className="ui-button" onClick={closeDialog}>取消</button><button className="ui-button ui-button-primary" disabled={loading} onClick={() => void saveGroup()}>{activeGroup ? <Edit3 size={16} /> : <FolderPlus size={16} />}{loading ? "保存中..." : "保存"}</button></>}><div className="dialog-form"><label className="form-field"><span className="form-label form-label-required">分组名称</span><input className="ui-input" value={groupName} onChange={(event) => setGroupName(event.target.value)} placeholder="请输入分组名称" maxLength={30} autoFocus /></label><label className="form-field"><span className="form-label">上级分组</span><PlatformTreeSelect value={groupParentId} onChange={setGroupParentId} emptyLabel="无，作为一级分组" nodes={groups.filter((group) => !activeGroup || !groupDescendantIds(activeGroup.id).has(group.id)).map((group) => ({ id: group.id, label: group.name, parentId: group.parentId }))} /></label>{error ? <div className="field-error">{error}</div> : null}</div></Modal> : null}
    </section>
  );
}
