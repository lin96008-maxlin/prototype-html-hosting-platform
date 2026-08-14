"use client";

import { useState } from "react";
import { Check, Copy, KeyRound, Plus } from "lucide-react";
import { PlatformSelect } from "@/components/platform-select";
import { Pagination } from "@/components/pagination";
import { SuccessMessage } from "@/components/success-message";
import type { InvitationCode } from "@/lib/types";
import { withBasePath } from "@/lib/app-path";

function stateOf(invitation: InvitationCode) {
  if (invitation.usedAt) return { label: "已使用", className: "status-tag-success" };
  if (new Date(invitation.expiresAt).getTime() <= Date.now()) return { label: "已过期", className: "" };
  return { label: "待使用", className: "status-tag-primary" };
}

export function InvitationManager({ initialItems }: { initialItems: InvitationCode[] }) {
  const [items, setItems] = useState(initialItems);
  const [duration, setDuration] = useState("10");
  const [customMinutes, setCustomMinutes] = useState("10");
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const pagedItems = items.slice((safePage - 1) * pageSize, safePage * pageSize);

  async function create() {
    const minutes = duration === "custom" ? Number(customMinutes) : Number(duration);
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 1440) {
      setError("自定义有效期应为 1 至 1440 分钟");
      return;
    }
    setLoading(true);
    setError("");
    const response = await fetch(withBasePath("/api/admin/invitations"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ expiresInMinutes: minutes }),
    });
    const result = await response.json();
    setLoading(false);
    if (!response.ok) return setError(result.message ?? "生成失败");
    setItems((value) => [result.invitation, ...value]);
    setMessage("邀请码已生成");
  }

  async function copy(code: string) {
    await navigator.clipboard.writeText(code);
    setCopied(code);
    setMessage("邀请码已复制");
    setTimeout(() => setCopied(""), 1500);
  }

  return (
    <section className="page-panel">
      <SuccessMessage message={message} onClose={() => setMessage("")} />
      <header className="page-panel-header">
        <h1 className="page-panel-title">邀请码</h1>
        <div className="page-panel-actions">
          <PlatformSelect
            className="expiry-select"
            value={duration}
            onChange={setDuration}
            options={[
              { value: "5", label: "5 分钟" },
              { value: "10", label: "10 分钟" },
              { value: "30", label: "30 分钟" },
              { value: "custom", label: "自定义" },
            ]}
          />
          {duration === "custom" ? (
            <label className="expiry-custom">
              <input className="ui-input" type="number" min="1" max="1440" step="1" aria-label="自定义有效期" value={customMinutes} onChange={(event) => setCustomMinutes(event.target.value)} />
              <span>分钟</span>
            </label>
          ) : null}
          <button className="ui-button ui-button-primary" type="button" disabled={loading} onClick={() => void create()}>
            <Plus size={16} />{loading ? "生成中..." : "生成邀请码"}
          </button>
        </div>
      </header>
      <div className="page-panel-body">
        {error ? <div className="inline-error" role="alert">{error}</div> : null}
        <div className="page-list-results data-table-wrap">
          {items.length === 0 ? (
            <div className="empty-state"><KeyRound size={42} /><b>暂无邀请码</b><p>生成邀请码后可邀请新成员注册</p></div>
          ) : (
          <table className="data-table invitation-table responsive-table">
            <thead>
              <tr><th className="serial-column">序号</th><th>邀请码</th><th>状态</th><th>有效期至</th><th>注册人员</th><th>生成人</th><th>生成时间</th><th>操作</th></tr>
            </thead>
            <tbody>
              {pagedItems.map((item, index) => {
                const state = stateOf(item);
                return (
                  <tr key={item.id}>
                    <td>{(safePage - 1) * pageSize + index + 1}</td>
                    <td><span className="code-cell"><KeyRound size={15} />{item.code}</span></td>
                    <td><span className={`status-tag ${state.className}`}>{state.label}</span></td>
                    <td>{new Date(item.expiresAt).toLocaleString("zh-CN")}</td>
                    <td>{item.usedByName ?? "-"}</td>
                    <td>{item.createdByName}</td>
                    <td>{new Date(item.createdAt).toLocaleString("zh-CN")}</td>
                    <td><button className="ui-button ui-button-sm" disabled={Boolean(item.usedAt)} onClick={() => void copy(item.code)}>{copied === item.code ? <Check size={14} /> : <Copy size={14} />}{copied === item.code ? "已复制" : "复制"}</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          )}
        </div>
        {items.length ? <Pagination total={items.length} page={safePage} pageSize={pageSize} pageSizeOptions={[20, 50, 100]} onPageChange={setPage} onPageSizeChange={(value) => { setPageSize(value); setPage(1); }} /> : null}
      </div>
    </section>
  );
}
