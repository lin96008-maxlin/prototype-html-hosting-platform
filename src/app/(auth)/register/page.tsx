import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth-shell";
import { RegisterForm } from "@/components/register-form";
import { getCurrentUser } from "@/lib/auth";
import { listDepartments } from "@/lib/data";

export default async function RegisterPage() {
  const user = await getCurrentUser();
  if (user) redirect("/projects");
  const departments = await listDepartments();
  return <AuthShell><RegisterForm departments={departments} /></AuthShell>;
}
