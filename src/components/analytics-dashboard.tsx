"use client";

import { useState } from "react";
import {
  Activity,
  Eye,
  FileUp,
  FolderKanban,
  HardDrive,
  LogIn,
  RefreshCw,
  Users,
} from "lucide-react";
import type { LoginLog, PlatformStats, PrototypeProject } from "@/lib/types";
import { Pagination } from "@/components/pagination";
import type { PlatformStorageBudget } from "@/lib/storage-budget";

function number(value: number) {
  return new Intl.NumberFormat("zh-CN").format(value);
}

function bytes(value: number) {
  if (value < 1024 * 1024) return `${Math.ceil(value / 1024)} KB`;
  if (value >= 1024 * 1024 * 1024) return `${(value / 1024 / 1024 / 1024).toFixed(1)} GB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function dateTime(value: string | null | undefined) {
  return value ? new Date(value).toLocaleString("zh-CN", { hour12: false }) : "暂无记录";
}

export function AnalyticsDashboard({
  stats,
  projects,
  logs,
  storageBudget,
}: {
  stats: PlatformStats;
  projects: PrototypeProject[];
  logs: LoginLog[];
  storageBudget: PlatformStorageBudget;
}) {
  const metrics = [
    { label: "原型访问 PV", value: stats.pv, icon: Eye, note: "当前有效原型访问次数" },
    {
      label: "访问用户 UV",
      value: stats.uv,
      icon: Users,
      note: "当前有效原型去重访客",
    },
    {
      label: "原型总数",
      value: stats.projects,
      icon: FolderKanban,
      note: "当前有效原型",
    },
    {
      label: "成功登录",
      value: stats.logins,
      icon: LogIn,
      note: "累计成功登录",
    },
    { label: "上传次数", value: stats.uploads, icon: FileUp, note: "累计首次上传" },
    {
      label: "更新次数",
      value: stats.updates,
      icon: RefreshCw,
      note: "累计替换更新",
    },
  ];
  const top = [...projects]
    .sort((a, b) => b.visitCount - a.visitCount)
    .slice(0, 8);
  const max = Math.max(1, ...top.map((item) => item.visitCount));
  const storage = storageBudget.diskUsedBytes;
  const storageLimit = storageBudget.diskTotalBytes;
  const percent = storageLimit > 0 ? Math.min(100, (storage / storageLimit) * 100) : 100;
  const backup = storageBudget.backupStatus;
  const backupLabel = backup?.status === "success"
    ? "数据库备份正常"
    : backup?.status === "running"
      ? "数据库备份执行中"
      : backup?.status === "failed"
        ? "数据库备份异常"
        : "数据库备份状态未接入";
  const [logPage, setLogPage] = useState(1);
  const [logPageSize, setLogPageSize] = useState(20);
  const logPageCount = Math.max(1, Math.ceil(logs.length / logPageSize));
  const safeLogPage = Math.min(logPage, logPageCount);
  const pagedLogs = logs.slice((safeLogPage - 1) * logPageSize, safeLogPage * logPageSize);

  return (
    <section className="analytics-page">
      <header className="analytics-head">
        <div>
          <h1>平台数据情况</h1>
        </div>
        <span>
          <Activity size={16} />
          数据实时汇总
        </span>
      </header>
      <div className="metric-grid">
        {metrics.map((item) => {
          const Icon = item.icon;
          return (
            <article className="metric-card" key={item.label}>
              <span className="metric-icon">
                <Icon size={19} />
              </span>
              <div>
                <span>{item.label}</span>
                <b>{number(item.value)}</b>
                <small>{item.note}</small>
              </div>
            </article>
          );
        })}
      </div>
      <div className="analytics-columns">
        <section className="analytics-section">
          <header>
            <h2>原型访问排行</h2>
            <span>按累计访问量</span>
          </header>
          <div className="visit-ranking">
            {top.map((project, index) => (
              <div className="ranking-row" key={project.id}>
                <b>{index + 1}</b>
                <div>
                  <span>
                    <strong>{project.name}</strong>
                    <small>
                      {project.ownerName} · {project.departmentName}
                    </small>
                  </span>
                  <i>
                    <em
                      style={{ width: `${(project.visitCount / max) * 100}%` }}
                    />
                  </i>
                </div>
                <strong>{number(project.visitCount)}</strong>
              </div>
            ))}
          </div>
        </section>
        <section className="analytics-section">
          <header>
            <h2>存储预算</h2>
            <span>{backupLabel}</span>
          </header>
          <div className="storage-overview">
            <span className="storage-icon">
              <HardDrive size={25} />
            </span>
            <div>
              <b>{bytes(storage)} / {bytes(storageLimit)}</b>
              <span>服务器整盘已用 / 磁盘总容量</span>
            </div>
            <strong>{percent.toFixed(1)}%</strong>
          </div>
          <span className="storage-large-track">
            <i style={{ width: `${percent}%` }} />
          </span>
          <div className="budget-rules">
            <p>
              <b>原型文件</b>
              <span>{bytes(storageBudget.prototypeDiskBytes)}</span>
            </p>
            <p>
              <b>本机数据库备份</b>
              <span>{bytes(storageBudget.backupRepositoryBytes)}</span>
            </p>
            <p>
              <b>系统/数据库/其他</b>
              <span>{bytes(storageBudget.systemAndOtherUsedBytes)}</span>
            </p>
            <p>
              <b>磁盘剩余可用</b>
              <span>{bytes(storageBudget.diskAvailableBytes)}</span>
            </p>
            <p>
              <b>系统安全预留</b>
              <span>{bytes(storageBudget.reserveBytes)}（{(storageBudget.reserveRatio * 100).toFixed(0)}%）</span>
            </p>
            <p>
              <b>当前可继续上传</b>
              <span>{bytes(storageBudget.uploadAvailableBytes)}</span>
            </p>
          </div>
          <div className="backup-status-summary">
            <span>最近数据库备份：{dateTime(backup?.lastSuccessAt)}</span>
            <span>快照：{backup?.snapshotId ?? "暂无"}</span>
            <span>
              最近数据库恢复验证：{backup?.lastRestoreVerificationStatus === "success"
                ? dateTime(backup.lastRestoreVerifiedAt)
                : backup?.lastRestoreVerificationStatus === "running"
                  ? "执行中"
                  : backup?.lastRestoreVerificationStatus === "failed"
                    ? "失败"
                    : "尚未执行"}
            </span>
          </div>
        </section>
      </div>
      <section className="analytics-section login-section">
        <header>
          <h2>登录日志</h2>
          <span>共 {logs.length} 条</span>
        </header>
        <div className="analytics-log-results data-table-wrap">
          {logs.length === 0 ? (
            <div className="empty-state"><LogIn size={42} /><b>暂无登录日志</b><p>产生登录记录后将在这里展示</p></div>
          ) : (
          <table className="data-table login-log-table responsive-table">
            <thead>
              <tr>
                <th className="serial-column">序号</th>
                <th>人员</th>
                <th>账号</th>
                <th>结果</th>
                <th>IP 地址</th>
                <th>登录时间</th>
              </tr>
            </thead>
            <tbody>
              {pagedLogs.map((log, index) => (
                <tr key={log.id}>
                  <td>{(safeLogPage - 1) * logPageSize + index + 1}</td>
                  <td>{log.userName ?? "未知人员"}</td>
                  <td>{log.account}</td>
                  <td>
                    <span
                      className={`status-tag ${log.success ? "status-tag-success" : "status-tag-danger"}`}
                    >
                      {log.success ? "成功" : "失败"}
                    </span>
                  </td>
                  <td>{log.ipAddress ?? "-"}</td>
                  <td>{new Date(log.createdAt).toLocaleString("zh-CN")}</td>
                </tr>
              ))}
            </tbody>
          </table>
          )}
        </div>
        {logs.length ? <Pagination total={logs.length} page={safeLogPage} pageSize={logPageSize} pageSizeOptions={[20, 50, 100]} onPageChange={setLogPage} onPageSizeChange={(value) => { setLogPageSize(value); setLogPage(1); }} /> : null}
      </section>
    </section>
  );
}
