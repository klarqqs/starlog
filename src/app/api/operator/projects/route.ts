import { badRequest, json, unauthorized } from '@/lib/response';
import { authorizeOperatorRead } from '@/stellog/operator-auth';
import { readOperatorProjects } from '@/stellog/operator-metrics';
import { metricsWindow, operatorMetricsQuery } from '@/stellog/operator-query';

export async function GET(request: Request) {
  const query = Object.fromEntries(new URL(request.url).searchParams);
  const parsed = operatorMetricsQuery.safeParse(query);
  if (!parsed.success) return badRequest({ message: 'Invalid metrics query.' });
  if (!(await authorizeOperatorRead(request))) return unauthorized();

  const windowError = metricsWindow(parsed.data.startAt, parsed.data.endAt);
  if (windowError) return badRequest({ message: windowError });

  const projects = await readOperatorProjects(
    new Date(parsed.data.startAt),
    new Date(parsed.data.endAt),
    {
      unit: parsed.data.unit || undefined,
      q: parsed.data.q,
      status: parsed.data.status,
      sort: parsed.data.sort,
      order: parsed.data.order,
    },
  );
  return json({ projects });
}
