"use client";

import Link from "next/link";
import { useState } from "react";
import { Eye, EyeOff, LogIn } from "lucide-react";
import { withBasePath } from "@/lib/app-path";

export function LoginForm({ demoMode, returnTo }: { demoMode: boolean; returnTo?: string }) {
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const response = await fetch(withBasePath("/api/auth/login"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        account: form.get("account"),
        password: form.get("password"),
        returnTo,
      }),
    });
    const result = await response.json();
    setLoading(false);
    if (!response.ok) {
      setError(result.message ?? "登录失败");
      return;
    }
    window.location.assign(result.next);
  }

  return (
    <div className="auth-form-wrap">
      <h1 className="auth-form-title">欢迎回来</h1>
      <p className="auth-form-desc">登录后进入原型工作区</p>
      {demoMode ? (
        <div className="demo-account">
          <span>演示账号：admin</span>
          <span>密码：Prototype@123</span>
        </div>
      ) : null}
      <form className="auth-form" onSubmit={submit}>
        <label className="form-field">
          <span className="form-label form-label-required">账号</span>
          <input className="ui-input" name="account" autoComplete="username" placeholder="请输入账号" defaultValue={demoMode ? "admin" : ""} />
        </label>
        <div className="form-field">
          <label className="form-label form-label-required" htmlFor="login-password">密码</label>
          <span className="password-input-wrap">
            <input
              id="login-password"
              className="ui-input"
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              placeholder="请输入密码"
              defaultValue={demoMode ? "Prototype@123" : ""}
            />
            <button
              className="icon-button password-toggle"
              type="button"
              title={showPassword ? "隐藏输入内容" : "显示输入内容"}
              aria-label={showPassword ? "隐藏输入内容" : "显示输入内容"}
              onClick={() => setShowPassword((value) => !value)}
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </span>
        </div>
        {error ? <div className="field-error" role="alert">{error}</div> : null}
        <button className="ui-button ui-button-primary auth-submit" type="submit" disabled={loading}>
          <LogIn size={16} />
          {loading ? "正在登录..." : "登录"}
        </button>
      </form>
      <div className="auth-switch">
        还没有账号？<Link href="/register">使用邀请码注册</Link>
      </div>
    </div>
  );
}
