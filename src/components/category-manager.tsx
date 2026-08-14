"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Edit3, Plus, Tags, Trash2, X } from "lucide-react";
import type { BusinessCategory } from "@/lib/types";
import { Pagination } from "@/components/pagination";
import { SuccessMessage } from "@/components/success-message";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { withBasePath } from "@/lib/app-path";

const NEW_CATEGORY_ID = "new-category";

function orderedCategories(items: BusinessCategory[]) {
  return [...items].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
}

export function CategoryManager({ initialItems }: { initialItems: BusinessCategory[] }) {
  const [items, setItems] = useState(initialItems);
  const [editing, setEditing] = useState<BusinessCategory | null>(null);
  const [movingId, setMovingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<BusinessCategory | null>(null);
  const [message, setMessage] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const orderedItems = useMemo(() => orderedCategories(items), [items]);
  const displayItems = editing?.id === NEW_CATEGORY_ID ? [...orderedItems, editing] : orderedItems;
  const pageCount = Math.max(1, Math.ceil(displayItems.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const pagedItems = displayItems.slice((safePage - 1) * pageSize, safePage * pageSize);

  function startCreate() {
    const sortOrder = Math.max(0, ...items.map((item) => item.sortOrder)) + 10;
    setEditing({ id: NEW_CATEGORY_ID, name: "", sortOrder, enabled: true });
    setError("");
    setPage(Math.max(1, Math.ceil((items.length + 1) / pageSize)));
  }

  async function create() {
    if (!editing || editing.id !== NEW_CATEGORY_ID) return;
    if (!editing.name.trim()) return setError("请输入分类名称");
    setError("");
    const response = await fetch(withBasePath("/api/admin/categories"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: editing.name }),
    });
    const result = await response.json();
    if (!response.ok) return setError(result.message ?? "创建失败");
    setItems((value) => orderedCategories([...value, result.category]));
    setEditing(null);
    setMessage("分类已新增");
  }

  async function update(item: BusinessCategory, changes: Partial<BusinessCategory>, closeEditor = false) {
    const response = await fetch(withBasePath(`/api/admin/categories/${item.id}`), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(changes),
    });
    const result = await response.json();
    if (!response.ok) return setError(result.message ?? "保存失败");
    setItems((value) => orderedCategories(value.map((entry) => entry.id === item.id ? { ...entry, ...changes } : entry)));
    if (closeEditor) setEditing(null);
    setError("");
    if (closeEditor) setMessage("分类名称已保存");
    else if (changes.enabled !== undefined) setMessage(changes.enabled ? "分类已启用" : "分类已停用");
  }

  async function move(item: BusinessCategory, direction: "up" | "down") {
    const index = orderedItems.findIndex((entry) => entry.id === item.id);
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (index < 0 || targetIndex < 0 || targetIndex >= orderedItems.length) return;
    setMovingId(item.id);
    setError("");
    try {
      const response = await fetch(withBasePath(`/api/admin/categories/${item.id}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ move: direction }),
      });
      const result = await response.json();
      if (!response.ok) return setError(result.message ?? "排序失败");
      const reordered = [...orderedItems];
      [reordered[index], reordered[targetIndex]] = [reordered[targetIndex], reordered[index]];
      setItems(reordered.map((entry, order) => ({ ...entry, sortOrder: (order + 1) * 10 })));
      setMessage("分类排序已更新");
    } catch {
      setError("排序失败，请稍后重试");
    } finally {
      setMovingId(null);
    }
  }

  async function remove(item: BusinessCategory) {
    const response = await fetch(withBasePath(`/api/admin/categories/${item.id}`), { method: "DELETE" });
    const result = await response.json();
    if (!response.ok) {
      setDeleteTarget(null);
      return setError(result.message ?? "删除失败");
    }
    setItems((value) => value.filter((entry) => entry.id !== item.id));
    setDeleteTarget(null);
    setMessage("分类已删除");
  }

  return (
    <section className="page-panel">
      <SuccessMessage message={message} onClose={() => setMessage("")} />
      <header className="page-panel-header">
        <h1 className="page-panel-title">业务分类</h1>
        <div className="page-panel-actions">
          <button className="ui-button ui-button-primary" type="button" disabled={editing?.id === NEW_CATEGORY_ID} onClick={startCreate}><Plus size={16} />新增分类</button>
        </div>
      </header>
      <div className="page-panel-body">
        {error ? <div className="inline-error">{error}<button className="icon-button" type="button" title="关闭提示" onClick={() => setError("")}><X size={15} /></button></div> : null}
        <div className="page-list-results data-table-wrap">
          {displayItems.length === 0 ? (
            <div className="empty-state"><Tags size={42} /><b>暂无业务分类</b><p>新增分类后可用于整理公开原型</p></div>
          ) : (
          <table className="data-table category-table responsive-table">
            <thead><tr><th className="serial-column">序号</th><th>分类名称</th><th>状态</th><th>排序</th><th>操作</th></tr></thead>
            <tbody>
              {pagedItems.map((item, rowIndex) => {
                const isEditing = editing?.id === item.id;
                const isNew = item.id === NEW_CATEGORY_ID;
                const orderIndex = orderedItems.findIndex((entry) => entry.id === item.id);
                return (
                  <tr className={isEditing ? "is-editing" : ""} key={item.id}>
                    <td>{(safePage - 1) * pageSize + rowIndex + 1}</td>
                    <td>{isEditing ? <input className="ui-input inline-edit" aria-label="分类名称" autoFocus value={editing.name} maxLength={30} onChange={(event) => setEditing({ ...editing, name: event.target.value })} onKeyDown={(event) => { if (event.key === "Enter") void (isNew ? create() : update(item, { name: editing.name }, true)); }} /> : item.name}</td>
                    <td>{isNew ? <span className="status-tag status-tag-success">启用</span> : <button className={`toggle-switch${item.enabled ? " is-on" : ""}`} type="button" role="switch" aria-label={`启停分类 ${item.name}`} aria-checked={item.enabled} onClick={() => void update(item, { enabled: !item.enabled })} />}</td>
                    <td>{isNew ? <span className="category-order-note">保存后可排序</span> : <span className="category-order-actions"><button className="icon-button" type="button" title={`上移 ${item.name}`} disabled={orderIndex === 0 || Boolean(editing) || movingId !== null} onClick={() => void move(item, "up")}><ArrowUp size={16} /></button><button className="icon-button" type="button" title={`下移 ${item.name}`} disabled={orderIndex === orderedItems.length - 1 || Boolean(editing) || movingId !== null} onClick={() => void move(item, "down")}><ArrowDown size={16} /></button></span>}</td>
                    <td><div className="table-actions">{isEditing ? <><button className="ui-button ui-button-sm" type="button" onClick={() => { setEditing(null); setError(""); }}>取消</button><button className="ui-button ui-button-sm" type="button" onClick={() => void (isNew ? create() : update(item, { name: editing.name }, true))}>保存</button></> : <><button className="icon-button" type="button" title={`编辑 ${item.name}`} onClick={() => { setEditing({ ...item }); setError(""); }}><Edit3 size={16} /></button><button className="icon-button danger" type="button" title={`删除 ${item.name}`} onClick={() => setDeleteTarget(item)}><Trash2 size={16} /></button></>}</div></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          )}
        </div>
        {displayItems.length ? <Pagination total={displayItems.length} page={safePage} pageSize={pageSize} pageSizeOptions={[20, 50, 100]} onPageChange={setPage} onPageSizeChange={(value) => { setPageSize(value); setPage(1); }} /> : null}
      </div>
      <ConfirmDialog open={Boolean(deleteTarget)} title={deleteTarget ? `删除“${deleteTarget.name}”？` : "删除分类？"} description="删除后无法恢复，请确认该分类已不再使用。" onCancel={() => setDeleteTarget(null)} onConfirm={() => { if (deleteTarget) void remove(deleteTarget); }} />
    </section>
  );
}
