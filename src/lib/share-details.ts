import type { PrototypeProject } from "@/lib/types";

export function formatShareDetails(project: PrototypeProject, shareUrl: string) {
  const lines = [`原型名称：${project.name}`, `分享链接：${shareUrl}`];
  if (project.shareExpiresAt) {
    lines.push(`截止时间：${new Date(project.shareExpiresAt).toLocaleString("zh-CN", { hour12: false })}`);
  }
  if (project.sharePassword) lines.push(`访问密码：${project.sharePassword}`);
  return lines.join("\n");
}
