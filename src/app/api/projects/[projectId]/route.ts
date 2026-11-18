import { z } from 'zod';
import { parseRequest } from '@/lib/request';
import { badRequest, json, notFound, unauthorized } from '@/lib/response';
import { getTeamUser } from '@/queries/prisma';
import { canReadOperatorProjects } from '@/stellog/operator-auth';
import { metricsWindow, operatorMetricsQuery } from '@/stellog/operator-query';
import { readProjectView } from '@/stellog/project-view';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { auth, query, error } = await parseRequest(request, operatorMetricsQuery);
  if (error) return error();

  const { projectId } = await params;
  if (!z.uuid().safeParse(projectId).success) return notFound();
  if (!auth?.user) return unauthorized();

  const allowed =
    canReadOperatorProjects(auth.user) || !!(await getTeamUser(projectId, auth.user.id));
  if (!allowed) return unauthorized();

  const windowError = metricsWindow(query.startAt, query.endAt);
  if (windowError) return badRequest({ message: windowError });

  const view = await readProjectView(
    projectId,
    new Date(query.startAt),
    new Date(query.endAt),
    query.unit || undefined,
  );
  if (!view) return notFound();

  return json(view);
}
