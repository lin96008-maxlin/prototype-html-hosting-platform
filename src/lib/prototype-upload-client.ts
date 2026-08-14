import JSZip from "jszip";

export interface PrototypeUploadSelection {
  files: File[];
  paths: string[];
  label: string;
  size: number;
  suggestedName: string;
  kind: "file" | "folder";
}

export type PrototypeUploadPhase = "packing" | "uploading" | "processing";

export interface PrototypeUploadProgress {
  phase: PrototypeUploadPhase;
  percent: number;
}

export const FOLDER_PACKING_COMPLETE_PERCENT = 45;
const UPLOAD_COMPLETE_PERCENT = 95;
const PROCESSING_PERCENT = 98;

export function overallUploadPercent(phasePercent: number, startPercent = 0) {
  const normalized = Math.max(0, Math.min(100, phasePercent));
  return Math.round(startPercent + (UPLOAD_COMPLETE_PERCENT - startPercent) * normalized / 100);
}

function safeZipName(value: string) {
  const normalized = value.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "-").trim();
  return `${normalized || "prototype"}.zip`;
}

function isIgnoredSystemPath(value: string) {
  return value.split("/").some((part) => {
    const normalized = part.toLowerCase();
    return normalized === "__macosx" || normalized === ".ds_store" || normalized.startsWith("._");
  });
}

export function createPrototypeUploadSelection(files: File[], paths: string[]): PrototypeUploadSelection {
  const selected = files
    .map((file, index) => ({ file, path: paths[index]?.replaceAll("\\", "/") || file.name }))
    .filter((item) => !isIgnoredSystemPath(item.path));
  if (!selected.length) throw new Error("请选择上传内容");
  const selectedFiles = selected.map((item) => item.file);
  const selectedPaths = selected.map((item) => item.path);
  const size = selectedFiles.reduce((total, file) => total + file.size, 0);
  const isSingleFile = selectedFiles.length === 1 && !selectedPaths[0]?.includes("/");
  if (isSingleFile && !/\.(html?|zip|rar)$/i.test(selectedFiles[0].name)) {
    throw new Error("仅支持 HTML、ZIP、RAR 或包含 index.html / preview.html 的项目文件夹");
  }
  const root = isSingleFile
    ? selectedFiles[0].name.replace(/\.(html?|zip|rar)$/i, "")
    : selectedPaths[0]?.split("/")[0] || selectedFiles[0].name.replace(/\.(html?|zip|rar)$/i, "");
  return {
    files: selectedFiles,
    paths: selectedPaths,
    label: isSingleFile ? selectedFiles[0].name : `${root}（${selectedFiles.length} 个文件）`,
    size,
    suggestedName: root.slice(0, 80),
    kind: isSingleFile ? "file" : "folder",
  };
}

export async function appendPrototypeUpload(
  form: FormData,
  selection: PrototypeUploadSelection,
  onProgress: (progress: PrototypeUploadProgress) => void,
) {
  if (selection.kind === "file") {
    form.set("file", selection.files[0]);
    return;
  }

  const zip = new JSZip();
  for (let index = 0; index < selection.files.length; index += 1) {
    zip.file(selection.paths[index], await selection.files[index].arrayBuffer());
    onProgress({
      phase: "packing",
      percent: Math.round(((index + 1) / selection.files.length) * FOLDER_PACKING_COMPLETE_PERCENT * 0.2),
    });
  }
  const blob = await zip.generateAsync(
    {
      type: "blob",
      compression: "DEFLATE",
      compressionOptions: { level: 6 },
    },
    (metadata) => {
      const phasePercent = Math.max(20, Math.min(100, Math.round(20 + metadata.percent * 0.8)));
      onProgress({
        phase: "packing",
        percent: Math.round(phasePercent * FOLDER_PACKING_COMPLETE_PERCENT / 100),
      });
    },
  );
  form.set("file", new File([blob], safeZipName(selection.suggestedName), {
    type: "application/zip",
  }));
}

export function parseUploadResponse(responseText: string, status: number) {
  const fallback = status === 413
    ? "上传内容超过服务器可接收范围"
    : status === 502 || status === 503 || status === 504
      ? "服务器处理超时，请稍后重试"
      : `上传失败（HTTP ${status || "网络中断"}）`;
  if (!responseText.trim()) {
    return { data: null, message: fallback };
  }
  try {
    const data = JSON.parse(responseText) as { message?: string; [key: string]: unknown };
    return { data, message: data.message ?? fallback };
  } catch {
    return { data: null, message: fallback };
  }
}

export function uploadPrototypeForm<T>(
  url: string,
  form: FormData,
  onProgress: (progress: PrototypeUploadProgress) => void,
  startPercent = 0,
) {
  return new Promise<T>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("POST", url);
    request.withCredentials = true;
    request.upload.addEventListener("progress", (event) => {
      if (!event.lengthComputable) return;
      onProgress({
        phase: "uploading",
        percent: overallUploadPercent((event.loaded / event.total) * 100, startPercent),
      });
    });
    request.upload.addEventListener("load", () => {
      onProgress({ phase: "processing", percent: PROCESSING_PERCENT });
    });
    request.addEventListener("load", () => {
      const parsed = parseUploadResponse(request.responseText, request.status);
      if (request.status < 200 || request.status >= 300) {
        reject(new Error(parsed.message));
        return;
      }
      if (!parsed.data) {
        reject(new Error("服务器返回内容异常，请刷新列表确认上传结果"));
        return;
      }
      onProgress({ phase: "processing", percent: 100 });
      resolve(parsed.data as T);
    });
    request.addEventListener("error", () => reject(new Error("上传连接中断，请检查网络后重试")));
    request.addEventListener("abort", () => reject(new Error("上传已取消")));
    request.send(form);
  });
}
