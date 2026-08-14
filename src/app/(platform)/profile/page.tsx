import { Building2, ShieldCheck, UserRound } from "lucide-react";
import { requireUser } from "@/lib/auth";

export default async function ProfilePage() {
  const user = await requireUser();
  const role = user.role === "super_admin" ? "超级管理员" : user.role === "admin" ? "管理员" : "普通用户";
  return <section className="page-panel account-panel"><header className="page-panel-header"><h1 className="page-panel-title">个人资料</h1></header><div className="page-panel-body"><div className="profile-summary"><span className="profile-avatar">{user.name.slice(0, 1)}</span><div><h2>{user.name}</h2><p>{user.account}</p></div></div><dl className="profile-details"><div><dt><UserRound size={16} />账号</dt><dd>{user.account}</dd></div><div><dt><Building2 size={16} />所属部门</dt><dd>{user.departmentName}</dd></div><div><dt><ShieldCheck size={16} />账号角色</dt><dd>{role}</dd></div></dl></div></section>;
}
