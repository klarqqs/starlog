import { parseRequest } from '@/lib/request';
import { badRequest, json, unauthorized } from '@/lib/response';
import { canReadOperatorProjects } from '@/stellog/operator-auth';
import { getEnrollmentMode } from '@/stellog/operator-enrollment';
import { readOperatorProjects, readUsageSeries } from '@/stellog/operator-metrics';
import { metricsWindow, operatorMetricsQuery } from '@/stellog/operator-query';
import { readAudience } from '@/stellog/project-traffic';

export async function GET(request: Request) {
  const { auth, query, error } = await parseRequest(request, operatorMetricsQuery);
  if (error) return error();
  if (!canReadOperatorProjects(auth?.user)) return unauthorized();

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
  const ids = [...new Set(projects.flatMap(project => project.websiteIds))];
  const start = new Date(query.startAt);
  const end = new Date(query.endAt);
  const [series, audience] = await Promise.all([
    readUsageSeries(ids, start, end),
    readAudience(ids, start, end),
  ]);

  return json({ enrollmentMode, projects, series, audience });
}
