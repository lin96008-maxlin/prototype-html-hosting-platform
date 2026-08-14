import { readFile } from "node:fs/promises";
import path from "node:path";
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { readPrototypeUpload } from "@/lib/prototype-upload";

const LARGE_HTML_BYTES = 21 * 1024 * 1024;
const HTML_PREFIX = "<!doctype html><html lang=\"zh-CN\"><body>";
const HTML_SUFFIX = "</body></html>";

function formWithFile(file: File) {
  const form = new FormData();
  form.set("file", file);
  return form;
}

function asArrayBuffer(content: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(content.byteLength);
  copy.set(content);
  return copy.buffer;
}

function htmlAtSize(size: number) {
  const padding = new Uint8Array(size - Buffer.byteLength(HTML_PREFIX) - Buffer.byteLength(HTML_SUFFIX));
  padding.fill(32);
  return new File([HTML_PREFIX, padding, HTML_SUFFIX], "临界原型.html", { type: "text/html" });
}

describe("readPrototypeUpload", () => {
  it("允许超过旧限制的单 HTML", async () => {
    const accepted = await readPrototypeUpload(formWithFile(htmlAtSize(LARGE_HTML_BYTES)));
    expect(accepted.totalSize).toBe(LARGE_HTML_BYTES);
    expect(accepted.entryPath).toBe("index.html");
  });

  it("ZIP 可去除单一根目录并保留子资源", async () => {
    const zip = new JSZip();
    zip.file("示例项目/index.html", "<!doctype html><html><body>ZIP</body></html>");
    zip.file("示例项目/assets/app.js", "document.body.dataset.ready='true'");
    const content = await zip.generateAsync({ type: "uint8array" });

    const upload = await readPrototypeUpload(formWithFile(new File([asArrayBuffer(content)], "示例项目.zip")));
    expect(upload.suggestedName).toBe("示例项目");
    expect(upload.assets.map((item) => item.path)).toEqual(["index.html", "assets/app.js"]);
  });

  it("ZIP 只有 preview.html 时将其作为入口", async () => {
    const zip = new JSZip();
    zip.file("预览项目/preview.html", "<!doctype html><html><body>Preview</body></html>");
    zip.file("预览项目/assets/app.js", "document.body.dataset.ready='true'");
    const content = await zip.generateAsync({ type: "uint8array" });

    const upload = await readPrototypeUpload(formWithFile(new File([asArrayBuffer(content)], "预览项目.zip")));
    expect(upload.entryPath).toBe("preview.html");
    expect(upload.assets.map((item) => item.path)).toEqual(["preview.html", "assets/app.js"]);
  });

  it("index.html 与 preview.html 同时存在时优先使用 index.html", async () => {
    const zip = new JSZip();
    zip.file("双入口/index.html", "<!doctype html><html><body>Index</body></html>");
    zip.file("双入口/preview.html", "<!doctype html><html><body>Preview</body></html>");
    const content = await zip.generateAsync({ type: "uint8array" });

    const upload = await readPrototypeUpload(formWithFile(new File([asArrayBuffer(content)], "双入口.zip")));
    expect(upload.entryPath).toBe("index.html");
  });

  it("文件夹只有 preview.html 时也能识别入口", async () => {
    const folderForm = new FormData();
    folderForm.append("files", new File(["<!doctype html><html><body>Folder</body></html>"], "preview.html"));
    folderForm.append("paths", "文件夹项目/preview.html");

    const upload = await readPrototypeUpload(folderForm);
    expect(upload.entryPath).toBe("preview.html");
    expect(upload.suggestedName).toBe("文件夹项目");
  });

  it("ZIP 项目可以包含超过 1000 个文件", async () => {
    const zip = new JSZip();
    zip.file("大项目/index.html", "<!doctype html><html><body>大项目</body></html>");
    for (let index = 0; index < 1100; index += 1) {
      zip.file(`大项目/assets/${index}.txt`, String(index));
    }
    const content = await zip.generateAsync({ type: "uint8array" });
    const upload = await readPrototypeUpload(formWithFile(new File([asArrayBuffer(content)], "大项目.zip")));
    expect(upload.assets).toHaveLength(1101);
  }, 20_000);

  it("允许浏览器可渲染的 HTML 片段并忽略 macOS 系统文件", async () => {
    const folderForm = new FormData();
    folderForm.append("files", new File(["<style>body{color:#123}</style><div>托管平台测试</div>"], "index.html"));
    folderForm.append("paths", "托管平台测试/index.html");
    folderForm.append("files", new File(["system metadata"], "._预览.png"));
    folderForm.append("paths", "托管平台测试/._预览.png");
    folderForm.append("files", new File(["image"], "预览.png"));
    folderForm.append("paths", "托管平台测试/预览.png");

    const upload = await readPrototypeUpload(folderForm);
    expect(upload.assets.map((item) => item.path)).toEqual(["index.html", "预览.png"]);
    expect(upload.suggestedName).toBe("托管平台测试");
  });

  it("仍会拒绝只有纯文本的伪 HTML 文件", async () => {
    await expect(readPrototypeUpload(formWithFile(new File(["not html"], "错误.html"))))
      .rejects.toThrow("index.html 不是有效的 HTML 文档");
  });

  it("拒绝缺少根入口 HTML 的 ZIP 和不安全的文件夹路径", async () => {
    const zip = new JSZip();
    zip.file("home.html", "<!doctype html><html><body>无首页</body></html>");
    const content = await zip.generateAsync({ type: "uint8array" });
    await expect(readPrototypeUpload(formWithFile(new File([asArrayBuffer(content)], "无首页.zip"))))
      .rejects.toThrow("项目根目录缺少 index.html 或 preview.html");

    const folderForm = new FormData();
    folderForm.append("files", new File(["<!doctype html><html></html>"], "index.html"));
    folderForm.append("paths", "../index.html");
    await expect(readPrototypeUpload(folderForm)).rejects.toThrow("项目中包含不安全的文件路径");
  });

  it("可读取真实 RAR 项目及其中的子资源", async () => {
    const content = await readFile(path.join(process.cwd(), "tests", "fixtures", "rar-project.rar"));
    const upload = await readPrototypeUpload(formWithFile(new File([asArrayBuffer(content)], "RAR示例.rar")));
    expect(upload.entryPath).toBe("index.html");
    expect(upload.assets.map((item) => item.path)).toContain("assets/theme.css");
    expect(upload.totalSize).toBe(238);
  });
});
