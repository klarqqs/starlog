import { parseRequest } from '@/lib/request';
import { badRequest, json, unauthorized } from '@/lib/response';
import { getEnrollmentMode } from '@/stellog/operator-enrollment';
import { readOperatorProjects } from '@/stellog/operator-metrics';
import { metricsWindow, operatorMetricsQuery } from '@/stellog/operator-query';

export async function GET(request: Request) {
  const { auth, query, error } = await parseRequest(request, operatorMetricsQuery);
  if (error) return error();
  if (!auth?.user?.isAdmin) return unauthorized();

  const windowError = metricsWindow(query.startAt, query.endAt);
  if (windowError) return badRequest({ message: windowError });

  const [projects, enrollmentMode] = await Promise.all([
    readOperatorProjects(new Date(query.startAt), new Date(query.endAt), {
      unit: query.unit || undefined,
      q: query.q,
      status: query.status,
      sort: query.sort,
      order: query.order,
    }),
    getEnrollmentMode(),
  ]);

  return json({ enrollmentMode, projects });
}
