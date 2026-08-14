"use client";

import Link from "next/link";
import { useState } from "react";
import { Eye, EyeOff, RefreshCw, UserPlus } from "lucide-react";
import { PlatformTreeSelect } from "@/components/platform-select";
import { withBasePath } from "@/lib/app-path";
import type { Department } from "@/lib/types";

export function RegisterForm({ departments }: { departments: Department[] }) {
  const [captchaNonce, setCaptchaNonce] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const response = await fetch(withBasePath("/api/auth/register"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(Object.fromEntries(form.entries())),
    });
    const result = await response.json();
    setLoading(false);
    if (!response.ok) {
      setError(result.message ?? "注册失败");
      setCaptchaNonce((value) => value + 1);
      return;
    }
    window.location.assign(result.next);
  }

  return (
    <div className="auth-form-wrap">
      <h1 className="auth-form-title">注册账号</h1>
      <p className="auth-form-desc">使用邀请码创建你的平台账号</p>
      <form className="auth-form" onSubmit={submit}>
        <div className="form-grid-two">
          <label className="form-field">
            <span className="form-label form-label-required">账号</span>
            <input className="ui-input" name="account" placeholder="字母开头" autoComplete="username" />
          </label>
          <label className="form-field">
            <span className="form-label form-label-required">姓名</span>
            <input className="ui-input" name="name" placeholder="请输入姓名" autoComplete="name" />
          </label>
        </div>
        <label className="form-field">
          <span className="form-label form-label-required">部门</span>
          <PlatformTreeSelect
            value={departmentId}
            onChange={setDepartmentId}
            placeholder="请选择所属部门"
            nodes={departments.map((department) => ({
              id: department.id,
              label: department.name,
              parentId: department.parentId,
            }))}
          />
          <input type="hidden" name="departmentId" value={departmentId} />
        </label>
        <div className="form-grid-two">
          <div className="form-field">
            <label className="form-label form-label-required" htmlFor="register-password">密码</label>
            <span className="password-input-wrap">
              <input className="ui-input" id="register-password" name="password" type={showPassword ? "text" : "password"} autoComplete="new-password" placeholder="至少8位" />
              <button className="icon-button password-toggle" type="button" title={showPassword ? "隐藏输入内容" : "显示输入内容"} aria-label={showPassword ? "隐藏输入内容" : "显示输入内容"} onClick={() => setShowPassword((value) => !value)}>
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </span>
          </div>
          <label className="form-field">
            <span className="form-label form-label-required">确认密码</span>
            <input className="ui-input" name="confirmPassword" type={showPassword ? "text" : "password"} autoComplete="new-password" placeholder="再次输入" />
          </label>
        </div>
        <label className="form-field">
          <span className="form-label form-label-required">图形验证码</span>
          <span className="captcha-row">
            <input className="ui-input" name="captcha" maxLength={4} placeholder="请输入验证码" autoComplete="off" inputMode="numeric" />
            <button className="captcha-refresh" type="button" title="刷新验证码" aria-label="刷新验证码" onClick={() => setCaptchaNonce((value) => value + 1)}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="captcha-image" src={withBasePath(`/api/auth/captcha?v=${captchaNonce}`)} alt="图形验证码" />
              <RefreshCw size={14} style={{ position: "absolute", right: 4, bottom: 4, color: "#3388ff", pointerEvents: "none" }} />
            </button>
          </span>
        </label>
        <label className="form-field">
          <span className="form-label form-label-required">邀请码</span>
          <input className="ui-input" name="invitationCode" placeholder="请输入管理员提供的邀请码" autoComplete="off" />
        </label>
        {error ? <div className="field-error" role="alert">{error}</div> : null}
        <button className="ui-button ui-button-primary auth-submit" type="submit" disabled={loading}>
          <UserPlus size={16} />
          {loading ? "正在注册..." : "注册并登录"}
        </button>
      </form>
      <div className="auth-switch">已有账号？<Link href="/login">返回登录</Link></div>
    </div>
  );
}
