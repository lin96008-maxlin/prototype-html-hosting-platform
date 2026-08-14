import { AppShell } from "@/components/app-shell";
import { requireUser } from "@/lib/auth";

export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return <AppShell user={user}>{children}</AppShell>;
}
