import { PublicSquare } from "@/components/public-square";
import { requireUser } from "@/lib/auth";
import { listCategories, listPublicProjects } from "@/lib/data";
import { env } from "@/lib/env";

export default async function SquarePage() {
  await requireUser();
  const [projects, categories] = await Promise.all([listPublicProjects(), listCategories()]);
  return <PublicSquare projects={projects} categories={categories} demoUrl={env.demoUrl} />;
}
