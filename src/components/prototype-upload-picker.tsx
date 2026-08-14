"use client";

import { FileArchive, FolderUp, UploadCloud } from "lucide-react";
import { useRef } from "react";
import { createPrototypeUploadSelection, type PrototypeUploadProgress, type PrototypeUploadSelection } from "@/lib/prototype-upload-client";

export type { PrototypeUploadSelection } from "@/lib/prototype-upload-client";

interface BrowserFileEntry {
  isFile: boolean;
  isDirectory: boolean;
  name: string;
  file: (success: (file: File) => void, failure?: (error: DOMException) => void) => void;
  createReader?: () => { readEntries: (success: (entries: BrowserFileEntry[]) => void, failure?: (error: DOMException) => void) => void };
}

function formatBytes(value: number) {
  if (value < 1024 * 1024) return `${Math.ceil(value / 1024)}KB`;
  return `${(value / 1024 / 1024).toFixed(2)}MB`;
}

async function fileFromEntry(entry: BrowserFileEntry, parent = ""): Promise<Array<{ file: File; path: string }>> {
  const relativePath = parent ? `${parent}/${entry.name}` : entry.name;
  if (entry.isFile) {
    return new Promise((resolve, reject) => entry.file(
      (file) => resolve([{ file, path: relativePath }]),
      reject,
    ));
  }
  if (!entry.isDirectory || !entry.createReader) return [];
  const reader = entry.createReader();
  const children: BrowserFileEntry[] = [];
  await new Promise<void>((resolve, reject) => {
    const readBatch = () => reader.readEntries((entries) => {
      if (!entries.length) return resolve();
      children.push(...entries);
      readBatch();
    }, reject);
    readBatch();
  });
  return (await Promise.all(children.map((child) => fileFromEntry(child, relativePath)))).flat();
}

export function PrototypeUploadPicker({
  selection,
  onChange,
  onError,
  disabled = false,
}: {
  selection: PrototypeUploadSelection | null;
  onChange: (selection: PrototypeUploadSelection) => void;
  onError: (message: string) => void;
  disabled?: boolean;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);

  function accept(files: File[], paths: string[]) {
    if (disabled) return;
    try {
      onChange(createPrototypeUploadSelection(files, paths));
      onError("");
    } catch (error) {
      onError(error instanceof Error ? error.message : "上传内容无效");
    }
  }

  async function drop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    if (disabled) return;
    try {
      const entries = Array.from(event.dataTransfer.items)
        .map((item) => (item as unknown as { webkitGetAsEntry?: () => BrowserFileEntry | null }).webkitGetAsEntry?.() ?? null)
        .filter((entry): entry is BrowserFileEntry => Boolean(entry));
      if (entries.length) {
        const collected = (await Promise.all(entries.map((entry) => fileFromEntry(entry)))).flat();
        accept(collected.map((item) => item.file), collected.map((item) => item.path));
        return;
      }
      const files = Array.from(event.dataTransfer.files);
      accept(files, files.map((file) => file.name));
    } catch {
      onError("无法读取拖入的文件夹，请改用“选择项目文件夹”");
    }
  }

  return (
    <div className={`upload-drop upload-bundle-drop${selection ? " has-file" : ""}`} onDragOver={(event) => event.preventDefault()} onDrop={(event) => void drop(event)}>
      <input ref={fileInput} disabled={disabled} type="file" accept=".html,.htm,.zip,.rar,text/html,application/zip,application/vnd.rar,application/x-rar-compressed" onChange={(event) => { const file = event.target.files?.[0]; if (file) accept([file], [file.name]); }} />
      <input ref={folderInput} disabled={disabled} className="folder-input" type="file" multiple {...({ webkitdirectory: "", directory: "" } as React.InputHTMLAttributes<HTMLInputElement>)} onChange={(event) => { const files = Array.from(event.target.files ?? []); accept(files, files.map((file) => file.webkitRelativePath || file.name)); }} />
      {selection?.kind === "folder" ? <FolderUp size={32} /> : selection ? <FileArchive size={32} /> : <UploadCloud size={32} />}
      <b>{selection?.label ?? "拖放单 HTML、ZIP、RAR 或项目文件夹到此处"}</b>
      <span>{selection ? `${formatBytes(selection.size)} · 上传后自动生成首页截图` : "压缩包和项目文件夹的根首页支持 index.html 或 preview.html"}</span>
      <div className="upload-choice-actions">
        <button className="ui-button" disabled={disabled} type="button" onClick={() => fileInput.current?.click()}><FileArchive size={15} />选择 HTML / ZIP / RAR</button>
        <button className="ui-button" disabled={disabled} type="button" onClick={() => folderInput.current?.click()}><FolderUp size={15} />选择项目文件夹</button>
      </div>
    </div>
  );
}

export function PrototypeUploadProgressBar({ progress }: { progress: PrototypeUploadProgress }) {
  const label = progress.phase === "packing"
    ? "正在打包项目文件"
    : progress.phase === "uploading"
      ? "正在上传"
      : "文件已上传，服务器处理中";
  return (
    <div className="prototype-upload-progress" aria-live="polite">
      <div><span>{label}</span><b>{progress.percent}%</b></div>
      <span
        className={`prototype-upload-progress-track${progress.phase === "processing" ? " is-processing" : ""}`}
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progress.percent}
      >
        <i style={{ width: `${progress.percent}%` }} />
      </span>
    </div>
  );
}
