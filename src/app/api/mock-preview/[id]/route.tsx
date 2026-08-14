import { ImageResponse } from "next/og";
import { getProjectById } from "@/lib/data";
import { demoStore } from "@/lib/demo-store";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const preview = demoStore.previewFiles.get(id);
  if (preview) {
    return new Response(Uint8Array.from(preview).buffer, {
      headers: {
        "Content-Type": "image/webp",
        "Cache-Control": "private, no-store",
      },
    });
  }
  const project = await getProjectById(id);
  const name = project?.name ?? "产品原型";
  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", background: "#f5f7fa", color: "#223355", fontFamily: "sans-serif" }}>
      <div style={{ width: 180, display: "flex", flexDirection: "column", padding: 20, background: "#ffffff", borderRight: "1px solid #e1e6ef" }}>
        <div style={{ display: "flex", color: "#3388ff", fontWeight: 700, fontSize: 20, marginBottom: 28 }}>PROTOTYPE HUB</div>
        {["运行概览", "业务管理", "数据分析", "系统设置"].map((item, index) => (
          <div key={item} style={{ display: "flex", padding: "10px 12px", marginBottom: 8, borderRadius: 4, color: index === 0 ? "#3388ff" : "#6b7a99", background: index === 0 ? "#f0f9ff" : "transparent" }}>{item}</div>
        ))}
      </div>
      <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        <div style={{ height: 54, display: "flex", alignItems: "center", padding: "0 22px", color: "#fff", background: "#3388ff", fontSize: 17 }}>{name}</div>
        <div style={{ display: "flex", flexDirection: "column", padding: 22 }}>
          <div style={{ display: "flex", fontSize: 21, fontWeight: 700, color: "#081126", marginBottom: 18 }}>工作台</div>
          <div style={{ display: "flex", gap: 14 }}>
            {["今日受理 1,286", "按时办结率 96.8%", "协同部门 32"].map((item) => (
              <div key={item} style={{ flex: 1, display: "flex", padding: 18, background: "#fff", border: "1px solid #e1e6ef", borderRadius: 6, fontSize: 16 }}>{item}</div>
            ))}
          </div>
          <div style={{ height: 170, display: "flex", marginTop: 14, padding: 18, background: "#fff", border: "1px solid #e1e6ef", borderRadius: 6 }}>业务趋势</div>
        </div>
      </div>
    </div>,
    { width: 960, height: 540 },
  );
}
