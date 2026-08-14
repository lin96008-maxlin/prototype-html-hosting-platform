import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { nanoid } from "nanoid";
import { env } from "@/lib/env";
import type { PrototypeAsset } from "@/lib/prototype-upload";
import { isPrototypeEntryName } from "@/lib/prototype-entry";

const dataRoot = path.resolve(env.dataDir);

function resolveStoredPath(relativePath: string) {
  const resolved = path.resolve(dataRoot, relativePath);
  const prefix = `${dataRoot}${path.sep}`;
  if (!resolved.startsWith(prefix)) throw new Error("文件路径不合法");
  return resolved;
}

export function storedFileAbsolutePath(relativePath: string) {
  return resolveStoredPath(relativePath);
}

async function writeStoredFile(relativePath: string, content: Uint8Array) {
  const absolutePath = resolveStoredPath(relativePath);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, content);
  return relativePath;
}

export async function writePrototypeFile(ownerId: string, projectId: string, content: Uint8Array) {
  const relativePath = path.posix.join("prototypes", ownerId, `${projectId}-${nanoid(8)}.html`);
  return writeStoredFile(relativePath, content);
}

export async function writePrototypeBundle(
  ownerId: string,
  projectId: string,
  assets: PrototypeAsset[],
  entryPath: string,
) {
  const relativeRoot = path.posix.join("prototypes", ownerId, `${projectId}-${nanoid(8)}`);
  try {
    await Promise.all(assets.map((asset) => writeStoredFile(path.posix.join(relativeRoot, asset.path), asset.content)));
    return path.posix.join(relativeRoot, entryPath);
  } catch (error) {
    await rm(resolveStoredPath(relativeRoot), { recursive: true, force: true }).catch(() => undefined);
    throw error;
  }
}

export async function writePreviewFile(ownerId: string, projectId: string, content: Uint8Array) {
  const relativePath = path.posix.join("previews", ownerId, `${projectId}-${nanoid(8)}.webp`);
  return writeStoredFile(relativePath, content);
}

export async function readStoredFile(relativePath: string) {
  return readFile(resolveStoredPath(relativePath));
}

export async function readPrototypeAsset(entryPath: string, assetPath: string) {
  const normalized = assetPath.replaceAll("\\", "/").replace(/^\/+/, "");
  if (!normalized || normalized.split("/").some((part) => !part || part === "." || part === "..")) {
    throw new Error("资源路径不合法");
  }
  const root = path.posix.dirname(entryPath);
  return readStoredFile(path.posix.join(root, normalized));
}

async function readBundleDirectory(root: string, current = ""): Promise<PrototypeAsset[]> {
  const directory = path.join(root, current);
  const entries = await readdir(directory, { withFileTypes: true });
  const assets: PrototypeAsset[] = [];
  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue;
    const relativePath = current ? path.join(current, entry.name) : entry.name;
    if (entry.isDirectory()) assets.push(...await readBundleDirectory(root, relativePath));
    else if (entry.isFile()) {
      assets.push({
        path: relativePath.replaceAll(path.sep, "/"),
        content: new Uint8Array(await readFile(path.join(root, relativePath))),
      });
    }
  }
  return assets;
}

export async function readStoredPrototypeBundle(entryPath: string) {
  const absoluteEntry = resolveStoredPath(entryPath);
  return readBundleDirectory(path.dirname(absoluteEntry));
}

export async function removeStoredFile(relativePath: string | null | undefined) {
  if (!relativePath) return;
  await rm(resolveStoredPath(relativePath), { force: true });
}

export async function removeStoredPrototype(entryPath: string | null | undefined) {
  if (!entryPath) return;
  const target = isPrototypeEntryName(entryPath)
    ? path.posix.dirname(entryPath)
    : entryPath;
  await rm(resolveStoredPath(target), { recursive: true, force: true });
}
