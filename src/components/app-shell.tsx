"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  BarChart3,
  ChevronDown,
  FolderKanban,
  KeyRound,
  LayoutGrid,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Tags,
  UserRound,
  UsersRound,
} from "lucide-react";
import { Brand } from "@/components/brand";
import { withBasePath } from "@/lib/app-path";
import type { UserProfile } from "@/lib/types";

const routeTitles: Record<string, string> = {
  "/projects": "我的原型",
  "/square": "公开广场",
  "/admin/invitations": "邀请码",
  "/admin/organization": "部门人员",
  "/admin/projects": "部门原型",
  "/admin/categories": "业务分类",
  "/admin/analytics": "平台数据",
  "/profile": "个人资料",
  "/change-password": "修改密码",
};

const routeTrails: Record<string, string[]> = {
  "/projects": ["原型管理", "我的原型"],
  "/square": ["原型管理", "公开广场"],
  "/admin/projects": ["原型管理", "部门原型"],
  "/admin/invitations": ["系统管理", "邀请码"],
  "/admin/organization": ["系统管理", "部门人员"],
  "/admin/categories": ["系统管理", "业务分类"],
  "/admin/analytics": ["系统管理", "平台数据"],
  "/profile": ["账号", "个人资料"],
  "/change-password": ["账号", "修改密码"],
};

const subscribeToHydration = () => () => {};

function NavLink({
  href,
  icon,
  label,
  onNavigate,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  onNavigate: () => void;
}) {
  const pathname = usePathname();
  const active = pathname === href;
  return (
    <Link
      className={`sidenav-link${active ? " is-active" : ""}`}
      href={href}
      title={label}
      aria-current={active ? "page" : undefined}
      onClick={onNavigate}
    >
      {icon}
      <span className="sidenav-link-label">{label}</span>
    </Link>
  );
}

export function AppShell({ user, children }: { user: UserProfile; children: React.ReactNode }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const hydrated = useSyncExternalStore(subscribeToHydration, () => true, () => false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  const isAdmin = user.role !== "user";
  const isSuperAdmin = user.role === "super_admin";
  const trail = routeTrails[pathname] ?? [routeTitles[pathname] ?? "工作区"];

  useEffect(() => {
    const onDocumentClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!userMenuRef.current?.contains(target)) setUserMenuOpen(false);
    };
    document.addEventListener("click", onDocumentClick);
    return () => document.removeEventListener("click", onDocumentClick);
  }, []);

  useEffect(() => {
    const onEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setUserMenuOpen(false);
      setMobileNavOpen(false);
    };
    document.addEventListener("keydown", onEscape);
    return () => document.removeEventListener("keydown", onEscape);
  }, []);

  async function logout() {
    await fetch(withBasePath("/api/auth/logout"), { method: "POST" });
    window.location.assign(withBasePath("/login"));
  }

  function closeMobileNav() {
    setMobileNavOpen(false);
  }

  return (
    <div
      className={`app-frame${collapsed ? " is-collapsed" : ""}${mobileNavOpen ? " is-mobile-nav-open" : ""}`}
      data-proto-app
      data-proto-platform="web"
      data-style="web-d"
      data-hydrated={hydrated}
    >
      <a className="skip-link" href="#main-content">跳到主内容</a>

      <aside className="sidenav" id="primary-sidenav" aria-label="主导航">
        <Brand compact />
        <nav className="sidenav-nav">
          <section className="sidenav-section">
            <div className="sidenav-heading">原型管理</div>
            <NavLink href="/projects" icon={<FolderKanban size={17} />} label="我的原型" onNavigate={closeMobileNav} />
            {isAdmin ? <NavLink href="/admin/projects" icon={<UsersRound size={17} />} label="部门原型" onNavigate={closeMobileNav} /> : null}
            <NavLink href="/square" icon={<LayoutGrid size={17} />} label="公开广场" onNavigate={closeMobileNav} />
          </section>
          {isAdmin ? (
            <section className="sidenav-section">
              <div className="sidenav-heading">系统管理</div>
              {isSuperAdmin ? <NavLink href="/admin/invitations" icon={<KeyRound size={17} />} label="邀请码" onNavigate={closeMobileNav} /> : null}
              <NavLink href="/admin/organization" icon={<UsersRound size={17} />} label="部门人员" onNavigate={closeMobileNav} />
              {isSuperAdmin ? <NavLink href="/admin/categories" icon={<Tags size={17} />} label="业务分类" onNavigate={closeMobileNav} /> : null}
              <NavLink href="/admin/analytics" icon={<BarChart3 size={17} />} label="平台数据" onNavigate={closeMobileNav} />
            </section>
          ) : null}
        </nav>
        <div className="sidenav-footer">
          <button
            className="sidenav-collapse"
            type="button"
            title={collapsed ? "展开导航" : "收起导航"}
            aria-label={collapsed ? "展开导航" : "收起导航"}
            aria-expanded={!collapsed}
            onClick={() => setCollapsed((value) => !value)}
          >
            {collapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}
            <span className="sidenav-link-label">收起导航</span>
          </button>
        </div>
      </aside>

      <button
        className="mobile-nav-backdrop"
        type="button"
        aria-label="关闭主导航"
        tabIndex={mobileNavOpen ? 0 : -1}
        onClick={() => setMobileNavOpen(false)}
      />

      <header className="topnav">
        <div className="topnav-context">
          <button
            className="mobile-nav-trigger"
            type="button"
            title="打开主导航"
            aria-label="打开主导航"
            aria-controls="primary-sidenav"
            aria-expanded={mobileNavOpen}
            onClick={() => setMobileNavOpen(true)}
          >
            <Menu size={18} />
          </button>
          <nav className="topnav-breadcrumb" aria-label="当前位置">
            {trail.map((item, index) => (
              <span key={`${item}-${index}`}>
                {index > 0 ? <i>/</i> : null}
                <b aria-current={index === trail.length - 1 ? "page" : undefined}>{item}</b>
              </span>
            ))}
          </nav>
        </div>
        <div className="topnav-tools">
          <div className="topnav-user-wrap" ref={userMenuRef}>
            <button
              className="topnav-user"
              type="button"
              aria-label={`${user.name}，${user.departmentName}`}
              aria-haspopup="menu"
              aria-expanded={userMenuOpen}
              onClick={() => setUserMenuOpen((value) => !value)}
            >
              <span className="topnav-avatar">{user.name.slice(0, 1)}</span>
              <span className="topnav-user-meta">
                <span className="topnav-user-name">{user.name}</span>
                <span className="topnav-user-dept">{user.departmentName}</span>
              </span>
              <ChevronDown size={15} aria-hidden="true" />
            </button>
            {userMenuOpen ? (
              <div className="user-dropdown" role="menu">
                <Link href="/profile" role="menuitem" onClick={() => setUserMenuOpen(false)}>
                  <UserRound size={16} />个人资料
                </Link>
                <Link href="/change-password" role="menuitem" onClick={() => setUserMenuOpen(false)}>
                  <KeyRound size={16} />修改密码
                </Link>
                <button className="danger" type="button" role="menuitem" onClick={logout}>
                  <LogOut size={16} />退出登录
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </header>

      <main
        className="content-scroll"
        id="main-content"
        tabIndex={-1}
        data-proto-scope={`page:${pathname.slice(1).replaceAll("/", "-") || "home"}`}
        data-proto-layer="0"
        data-proto-scroll-container
      >
        {children}
      </main>
    </div>
  );
}
