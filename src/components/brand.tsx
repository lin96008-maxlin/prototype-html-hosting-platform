import { PanelsTopLeft } from "lucide-react";

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className={compact ? "app-brand" : "auth-logo"}>
      <span className={compact ? "app-brand-mark" : "auth-logo-mark"}>
        <PanelsTopLeft size={22} strokeWidth={1.8} aria-hidden="true" />
      </span>
      <span className={compact ? "app-brand-title" : "auth-logo-title"}>
        原型托管平台demo
      </span>
    </div>
  );
}
