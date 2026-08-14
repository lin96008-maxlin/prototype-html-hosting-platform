import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import {
  appendPrototypeUpload,
  createPrototypeUploadSelection,
  FOLDER_PACKING_COMPLETE_PERCENT,
  overallUploadPercent,
  parseUploadResponse,
  type PrototypeUploadSelection,
} from "@/lib/prototype-upload-client";

describe("prototype upload client", () => {
  it("选择文件夹时不计入 macOS 系统文件", () => {
    const selection = createPrototypeUploadSelection(
      [new File(["<div>首页</div>"], "index.html"), new File(["metadata"], "._首页.png"), new File(["image"], "首页.png")],
      ["原型/index.html", "原型/._首页.png", "原型/首页.png"],
    );
    expect(selection.label).toBe("原型（2 个文件）");
    expect(selection.paths).toEqual(["原型/index.html", "原型/首页.png"]);
  });

  it("允许选择以 preview.html 为入口的项目文件夹", () => {
    const selection = createPrototypeUploadSelection(
      [new File(["<!doctype html><html></html>"], "preview.html")],
      ["预览原型/preview.html"],
    );
    expect(selection.kind).toBe("folder");
    expect(selection.paths).toEqual(["预览原型/preview.html"]);
  });

  it("将超过 1000 个文件的项目文件夹打成单个 ZIP", async () => {
    const files = Array.from({ length: 1101 }, (_, index) => new File(
      [index === 0 ? "<!doctype html><html></html>" : String(index)],
      index === 0 ? "index.html" : `${index}.txt`,
    ));
    const selection: PrototypeUploadSelection = {
      files,
      paths: files.map((file) => `大目录/${file.name}`),
      label: "大目录（1101 个文件）",
      size: files.reduce((total, file) => total + file.size, 0),
      suggestedName: "大目录",
      kind: "folder",
    };
    const form = new FormData();
    const progress: number[] = [];
    await appendPrototypeUpload(form, selection, (item) => progress.push(item.percent));

    const archive = form.get("file");
    expect(archive).toBeInstanceOf(File);
    const zip = await JSZip.loadAsync(await (archive as File).arrayBuffer());
    expect(Object.values(zip.files).filter((entry) => !entry.dir)).toHaveLength(1101);
    expect(zip.file("大目录/index.html")).not.toBeNull();
    expect(progress.at(-1)).toBe(FOLDER_PACKING_COMPLETE_PERCENT);
    expect(progress.every((item, index) => index === 0 || item >= progress[index - 1])).toBe(true);
  }, 20_000);

  it("文件夹打包结束后，网络上传总进度不会回到 0", () => {
    const progress = [
      FOLDER_PACKING_COMPLETE_PERCENT,
      overallUploadPercent(0, FOLDER_PACKING_COMPLETE_PERCENT),
      overallUploadPercent(50, FOLDER_PACKING_COMPLETE_PERCENT),
      overallUploadPercent(100, FOLDER_PACKING_COMPLETE_PERCENT),
    ];
    expect(progress).toEqual([45, 45, 70, 95]);
    expect(progress.every((item, index) => index === 0 || item >= progress[index - 1])).toBe(true);
  });

  it("空错误响应不会再显示 JSON 解析异常", () => {
    expect(parseUploadResponse("", 500).message).toBe("上传失败（HTTP 500）");
    expect(parseUploadResponse("", 413).message).toBe("上传内容超过服务器可接收范围");
  });
});
