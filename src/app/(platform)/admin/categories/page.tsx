import { CategoryManager } from "@/components/category-manager";
import { requireSuperAdmin } from "@/lib/auth";
import { listCategories } from "@/lib/data";

export default async function CategoriesPage() {
  await requireSuperAdmin();
  return <CategoryManager initialItems={await listCategories()} />;
}
