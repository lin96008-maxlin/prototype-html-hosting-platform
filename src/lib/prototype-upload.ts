import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";
import JSZip from "jszip";
import { createExtractorFromData } from "node-unrar-js";
import { isHtmlDocument } from "@/lib/storage-budget";
import { findPrototypeEntryPath } from "@/lib/prototype-entry";

export interface PrototypeAsset {
  path: string;
  content: Uint8Array;
}

export interface PrototypeUpload {
  assets: PrototypeAsset[];
  entryPath: string;
  totalSize: number;
  suggestedName: string;
  sourceKind: "html" | "zip" | "rar" | "folder";
  sourceName: string;
}

let unrarWasmPromise: Promise<ArrayBuffer> | undefined;

function unrarWasm() {
  unrarWasmPromise ??= readFile(
    path.join(process.cwd(), "node_modules", "node-unrar-js", "esm", "js", "unrar.wasm"),
  ).then((content) => content.buffer.slice(
    content.byteOffset,
    content.byteOffset + content.byteLength,
  ) as ArrayBuffer);
  return unrarWasmPromise;
}

function safePath(value: string) {
  const normalized = value.replaceAll("\\", "/").replace(/^\.\//, "");
  const parts = normalized.split("/").filter(Boolean);
  if (!parts.length || parts.some((part) => part === "." || part === ".." || part.includes(":")) || normalized.startsWith("/")) {
    throw new Error("项目中包含不安全的文件路径");
  }
  if (normalized.length > 500) throw new Error("项目中的文件路径过长");
  return parts.join("/");
}

function safeSourceName(value: string, fallback: string) {
  const name = value.replaceAll("\\", "/").split("/").pop()?.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  return (name || fallback).slice(0, 180);
}

function stripSingleRoot(assets: PrototypeAsset[]) {
  if (findPrototypeEntryPath(assets.map((asset) => asset.path))) return assets;
  const roots = new Set(assets.map((asset) => asset.path.split("/")[0]));
  if (roots.size !== 1) return assets;
  const root = [...roots][0];
  const stripped = assets.map((asset) => ({ ...asset, path: asset.path.slice(root.length + 1) }));
  return findPrototypeEntryPath(stripped.map((asset) => asset.path)) ? stripped : assets;
}

function isIgnoredSystemPath(value: string) {
  return value.split("/").some((part) => {
    const normalized = part.toLowerCase();
    return normalized === "__macosx" || normalized === ".ds_store" || normalized.startsWith("._");
  });
}

function validateAssets(input: PrototypeAsset[]) {
  const assets = stripSingleRoot(input.filter((asset) => !isIgnoredSystemPath(asset.path)));
  if (!assets.length) throw new Error("项目中没有可上传的文件");
  const seen = new Set<string>();
  for (const asset of assets) {
    const key = asset.path.toLowerCase();
    if (seen.has(key)) throw new Error(`项目中存在重复文件：${asset.path}`);
    seen.add(key);
  }
  const totalSize = assets.reduce((total, asset) => total + asset.content.byteLength, 0);
  const entryPath = findPrototypeEntryPath(assets.map((asset) => asset.path));
  const entry = assets.find((asset) => asset.path === entryPath);
  if (!entry) throw new Error("项目根目录缺少 index.html 或 preview.html");
  if (!isHtmlDocument(new TextDecoder().decode(entry.content))) throw new Error(`${entry.path} 不是有效的 HTML 文档`);
  return { assets, entryPath: entry.path, totalSize };
}

async function fromZip(file: File): Promise<PrototypeUpload> {
  const sourceContent = new Uint8Array(await file.arrayBuffer());
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(sourceContent, { createFolders: false });
  } catch {
    throw new Error("ZIP 压缩包损坏或格式不受支持");
  }
  const entries = Object.values(zip.files).filter((entry) => !entry.dir);
  const assets: PrototypeAsset[] = [];
  for (const entry of entries) {
    const content = await entry.async("uint8array");
    assets.push({ path: safePath(entry.name), content });
  }
  return {
    ...validateAssets(assets),
    suggestedName: file.name.replace(/\.zip$/i, "").slice(0, 80),
    sourceKind: "zip",
    sourceName: safeSourceName(file.name, "prototype.zip"),
  };
}

async function fromRar(file: File): Promise<PrototypeUpload> {
  const sourceContent = new Uint8Array(await file.arrayBuffer());
  try {
    const extractor = await createExtractorFromData({
      data: sourceContent.buffer.slice(
        sourceContent.byteOffset,
        sourceContent.byteOffset + sourceContent.byteLength,
      ) as ArrayBuffer,
      wasmBinary: await unrarWasm(),
    });
    const listed = extractor.getFileList();
    const headers = [...listed.fileHeaders];
    if (listed.arcHeader.flags.volume) throw new Error("暂不支持分卷 RAR 压缩包");
    if (listed.arcHeader.flags.headerEncrypted || headers.some((header) => header.flags.encrypted)) {
      throw new Error("暂不支持加密 RAR 压缩包");
    }
    const extracted = extractor.extract();
    const assets: PrototypeAsset[] = [];
    for (const item of extracted.files) {
      if (item.fileHeader.flags.directory) continue;
      if (!item.extraction) throw new Error(`RAR 文件解压失败：${item.fileHeader.name}`);
      assets.push({ path: safePath(item.fileHeader.name), content: item.extraction });
    }
    return {
      ...validateAssets(assets),
      suggestedName: file.name.replace(/\.rar$/i, "").slice(0, 80),
      sourceKind: "rar",
      sourceName: safeSourceName(file.name, "prototype.rar"),
    };
  } catch (error) {
    if (error instanceof Error && /^(暂不支持|项目|RAR (?:解压后|文件解压失败)|(?:index|preview)\.html)/.test(error.message)) {
      throw error;
    }
    console.error("RAR 解压失败", error);
    throw new Error("RAR 压缩包损坏或格式不受支持");
  }
}

export async function readPrototypeUpload(form: FormData): Promise<PrototypeUpload> {
  const primary = form.get("file");
  if (primary instanceof File && primary.size > 0) {
    if (/\.zip$/i.test(primary.name)) return fromZip(primary);
    if (/\.rar$/i.test(primary.name)) return fromRar(primary);
    if (!/\.html?$/i.test(primary.name)) throw new Error("仅支持 HTML、ZIP、RAR 或项目文件夹");
    const content = new Uint8Array(await primary.arrayBuffer());
    const validated = validateAssets([{ path: "index.html", content }]);
    return {
      ...validated,
      suggestedName: primary.name.replace(/\.html?$/i, "").slice(0, 80),
      sourceKind: "html",
      sourceName: safeSourceName(primary.name, "prototype.html"),
    };
  }

  const files = form.getAll("files").filter((item): item is File => item instanceof File && item.size > 0);
  const paths = form.getAll("paths").map(String);
  if (!files.length || files.length !== paths.length) throw new Error("请选择上传内容");
  const assets: PrototypeAsset[] = [];
  for (let index = 0; index < files.length; index += 1) {
    const content = new Uint8Array(await files[index].arrayBuffer());
    assets.push({ path: safePath(paths[index]), content });
  }
  const validated = validateAssets(assets);
  const suggestedName = safePath(paths[0]).split("/")[0].slice(0, 80);
  return {
    ...validated,
    suggestedName,
    sourceKind: "folder",
    sourceName: safeSourceName(`${suggestedName}.zip`, "prototype.zip"),
  };
}
