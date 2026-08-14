import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import {
  attachmentDisposition,
  createPrototypeZip,
  projectDownloadName,
} from "@/lib/project-download";

describe("原型下载", () => {
  it("单 HTML 保留上传时的文件名", () => {
    expect(projectDownloadName({
      name: "测试原型",
      sourceKind: "html",
      sourceName: "原始首页.html",
    })).toBe("原始首页.html");
  });

  it("ZIP、RAR 和文件夹统一下载为 ZIP", () => {
    expect(projectDownloadName({ name: "A", sourceKind: "zip", sourceName: "A.zip" })).toBe("A.zip");
    expect(projectDownloadName({ name: "B", sourceKind: "rar", sourceName: "B.rar" })).toBe("B.zip");
    expect(projectDownloadName({ name: "C", sourceKind: "folder", sourceName: "C.zip" })).toBe("C.zip");
  });

  it("中文文件名使用标准下载响应头", () => {
    expect(attachmentDisposition("原型.html")).toContain("filename*=UTF-8''%E5%8E%9F%E5%9E%8B.html");
  });

  it("生成的 ZIP 保留项目相对路径", async () => {
    const content = await createPrototypeZip([
      { path: "index.html", content: new TextEncoder().encode("<html></html>") },
      { path: "assets/app.js", content: new TextEncoder().encode("console.log(1)") },
    ]);
    const zip = await JSZip.loadAsync(content);
    expect(Object.keys(zip.files)).toEqual(expect.arrayContaining(["index.html", "assets/app.js"]));
  });
});
