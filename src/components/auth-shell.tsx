import { Brand } from "@/components/brand";
import { Eye, FolderKanban, Share2 } from "lucide-react";

export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="auth-layout">
      <aside className="auth-brand">
        <Brand />
        <div className="auth-brand-main">
          <span className="auth-eyebrow">产品原型工作区</span>
          <h1>集中托管、预览和分享产品原型</h1>
          <p>统一管理原型版本与访问入口，让评审、演示和协作更顺畅。</p>
          <div className="auth-workspace-preview" aria-hidden="true">
            <div className="auth-preview-head">
              <span>最近更新</span>
              <small>5 个原型</small>
            </div>
            <div className="auth-preview-row">
              <FolderKanban size={18} />
              <span><b>客户协作工作台</b><small>协作工具</small></span>
              <i><Eye size={14} />295</i>
            </div>
            <div className="auth-preview-row">
              <FolderKanban size={18} />
              <span><b>商品运营管理台</b><small>商业产品</small></span>
              <i><Share2 size={14} />已共享</i>
            </div>
            <div className="auth-preview-row">
              <FolderKanban size={18} />
              <span><b>数据分析驾驶舱</b><small>数据产品</small></span>
              <i><Eye size={14} />174</i>
            </div>
          </div>
        </div>
        <p className="auth-brand-foot">原型托管平台demo</p>
      </aside>
      <main className="auth-main">
        <section className="auth-panel">{children}</section>
      </main>
    </div>
  );
}
