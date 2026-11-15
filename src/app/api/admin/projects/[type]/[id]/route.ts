import { badRequest, notFound, ok, unauthorized } from '@/lib/response';
import { requireOperatorAdmin } from '@/stellog/operator-auth';
import { projectPath, removeProject } from '@/stellog/operator-projects';

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ type: string; id: string }> },
) {
  if (!(await requireOperatorAdmin(request))) return unauthorized();
  const { type, id } = await params;
  const project = projectPath(type, id);
  if (!project) return badRequest({ message: 'Unknown project.' });
  if (!(await removeProject(project.type, project.id))) return notFound();
  return ok();
}
