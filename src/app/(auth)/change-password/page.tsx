import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { ChangePasswordForm } from "@/components/change-password-form";
import { getCurrentUser } from "@/lib/auth";

export default async function ChangePasswordPage() {
  const user = await getCurrentUser({ allowMustChangePassword: true });
  if (!user) redirect("/login");
  return (
    <AppShell user={user}>
      <section className="page-panel account-panel">
        <header className="page-panel-header"><h1 className="page-panel-title">修改密码</h1></header>
        <div className="page-panel-body account-form-wrap">
          <ChangePasswordForm account={user.account} forced={user.mustChangePassword} />
        </div>
      </section>
    </AppShell>
  );
}
