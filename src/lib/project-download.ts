import JSZip from "jszip";
import type { PrototypeAsset } from "@/lib/prototype-upload";
import type { PrototypeProject } from "@/lib/types";

function safeFileName(value: string, fallback: string) {
  const name = value
    .replaceAll("\\", "/")
    .split("/")
    .pop()
    ?.replace(/[\u0000-\u001f\u007f<>:"|?*]/g, "_")
    .trim();
  return name && name !== "." && name !== ".." ? name.slice(0, 180) : fallback;
}

export function projectDownloadName(project: Pick<PrototypeProject, "name" | "sourceKind" | "sourceName">) {
  if (project.sourceKind === "html") {
    return safeFileName(project.sourceName, `${project.name}.html`);
  }
  const source = safeFileName(project.sourceName, project.name).replace(/\.(?:zip|rar)$/i, "");
  return `${source || "prototype"}.zip`;
}

export function attachmentDisposition(fileName: string) {
  const encoded = encodeURIComponent(fileName).replace(/[!'()*]/g, (value) =>
    `%${value.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  const ascii = fileName
    .replace(/[^\x20-\x7e]/g, "_")
    .replace(/["\\;]/g, "_")
    .slice(0, 180) || "prototype";
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

export async function createPrototypeZip(assets: PrototypeAsset[]) {
  const zip = new JSZip();
  for (const asset of assets) zip.file(asset.path, asset.content);
  return zip.generateAsync({
    type: "uint8array",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });
}
