import { getCurrentUser } from "@/lib/auth";
import { getProjectById } from "@/lib/data";
import { isDemoMode } from "@/lib/env";
import { readStoredFile } from "@/lib/file-storage";
import { canViewProject } from "@/lib/project-permission";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  if (isDemoMode) return new Response(null, { status: 404 });
  const user = await getCurrentUser();
  if (!user) return new Response(null, { status: 401 });
  const { id } = await context.params;
  const project = await getProjectById(id);
  if (!project?.previewPath) return new Response(null, { status: 404 });
  if (!project.isPublic && !(await canViewProject(user, project))) {
    return new Response(null, { status: 403 });
  }
  try {
    return new Response(await readStoredFile(project.previewPath), {
      headers: {
        "Content-Type": "image/webp",
        "Cache-Control": "private, max-age=3600",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response(null, { status: 404 });
  }
}
