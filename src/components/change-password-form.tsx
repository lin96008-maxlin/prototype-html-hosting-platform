"use client";

import { useState } from "react";
import { Eye, EyeOff, KeyRound } from "lucide-react";
import { withBasePath } from "@/lib/app-path";

function PasswordField({ label, name, autoComplete, placeholder }: {
  label: string;
  name: string;
  autoComplete: string;
  placeholder: string;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="form-field">
      <label className="form-label form-label-required" htmlFor={name}>{label}</label>
      <span className="password-input-wrap">
        <input className="ui-input" id={name} name={name} type={visible ? "text" : "password"} autoComplete={autoComplete} placeholder={placeholder} />
        <button className="icon-button password-toggle" type="button" title={visible ? "隐藏输入内容" : "显示输入内容"} aria-label={visible ? "隐藏输入内容" : "显示输入内容"} onClick={() => setVisible((value) => !value)}>
          {visible ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </span>
    </div>
  );
}

export function ChangePasswordForm({ account, forced = false }: { account: string; forced?: boolean }) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    const form = new FormData(event.currentTarget);
    const response = await fetch(withBasePath("/api/auth/change-password"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(Object.fromEntries(form.entries())),
    });
    const result = await response.json();
    setLoading(false);
    if (!response.ok) {
      setMessage(result.message ?? "密码修改失败");
      return;
    }
    window.location.assign(result.next);
  }

  return (
    <form className="auth-form" onSubmit={submit}>
      <input type="hidden" name="username" value={account} autoComplete="username" readOnly />
      {forced ? <div className="demo-account">当前为临时密码，请修改后继续使用平台</div> : null}
      <PasswordField label="当前密码" name="currentPassword" autoComplete="current-password" placeholder="请输入当前密码" />
      <PasswordField label="新密码" name="newPassword" autoComplete="new-password" placeholder="至少8位" />
      <PasswordField label="确认新密码" name="confirmPassword" autoComplete="new-password" placeholder="再次输入新密码" />
      {message ? <div className="field-error" role="alert">{message}</div> : null}
      <button className="ui-button ui-button-primary account-submit" type="submit" disabled={loading}>
        <KeyRound size={16} />{loading ? "正在更新..." : "更新密码"}
      </button>
    </form>
  );
}
