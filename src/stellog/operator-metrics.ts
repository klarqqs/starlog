import prisma from '@/lib/prisma';
import {
  type ApiStat,
  type EnrollmentStatus,
  type OperatorSort,
  rankProjects,
  type WebStat,
} from '@/stellog/operator-report';
import { metricGrain } from '@/stellog/tenant-report';

const HIST_COLUMNS = [
  'h5',
  'h10',
  'h25',
  'h50',
  'h100',
  'h250',
  'h500',
  'h1000',
  'h2500',
  'h5000',
  'h10000',
  'h_inf',
] as const;

export async function readOperatorProjects(
  start: Date,
  end: Date,
  options: {
    unit?: string;
    q?: string;
    status?: EnrollmentStatus | 'all';
    sort?: OperatorSort;
    order?: 'asc' | 'desc';
  } = {},
) {
  const length = end.getTime() - start.getTime();
  const previousEnd = new Date(start.getTime() - 1);
  const previousStart = new Date(previousEnd.getTime() - length);
  const grain = metricGrain(start, end, options.unit);
  const [teams, websites, webStats, apiStats, previousWeb, previousApi] = await Promise.all([
    prisma.client.team.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true, enrollmentStatus: true },
    }),
    prisma.client.website.findMany({
      where: { deletedAt: null },
      select: {
        id: true,
        name: true,
        domain: true,
        teamId: true,
        enrollmentStatus: true,
        kind: true,
      },
    }),
    webStatsFor(start, end),
    apiStatsFor(start, end, grain),
    webStatsFor(previousStart, previousEnd),
    apiStatsFor(previousStart, previousEnd, grain),
  ]);

  return rankProjects(
    teams.map(team => ({
      id: team.id,
      name: team.name,
      status: asStatus(team.enrollmentStatus),
    })),
    websites.map(website => ({
      id: website.id,
      name: website.name,
      teamId: website.teamId,
      status: asStatus(website.enrollmentStatus),
      domain: website.domain,
      kind: website.kind === 'api' ? 'api' : 'site',
    })),
    webStats,
    apiStats,
    { ...options, previous: { web: previousWeb, api: previousApi } },
  );
}

export async function webStatsFor(
  start: Date,
  end: Date,
  websiteIds?: string[],
): Promise<WebStat[]> {
  const filter = websiteIds ? 'and website_id = any({{websiteIds}}::uuid[])' : '';
  const rows = await prisma.rawQuery(
    `
    select website_id as "websiteId",
      count(*) filter (where event_type = 1)::int as pageviews,
      count(distinct session_id) filter (where event_type = 1)::int as visitors
    from website_event
    where created_at >= {{start}} and created_at <= {{end}}
    ${filter}
    group by website_id
    `,
    { start, end, websiteIds },
    'operatorWebStats',
  );
  return rows.map((row: WebStat) => ({
    websiteId: row.websiteId,
    pageviews: Number(row.pageviews),
    visitors: Number(row.visitors),
  }));
}

export async function apiStatsFor(
  start: Date,
  end: Date,
  grain: 'hour' | 'day',
  websiteIds?: string[],
): Promise<ApiStat[]> {
  const table = grain === 'hour' ? 'api_metric_hour' : 'api_metric_day';
  const filter = websiteIds ? 'and website_id = any({{websiteIds}}::uuid[])' : '';
  // A counter records requests and no latency. Its histogram must not move a percentile.
  const columns = HIST_COLUMNS.map(
    column =>
      `coalesce(sum(case when latency_count > 0 then ${column} else 0 end), 0)::int as "${column}"`,
  ).join(', ');
  const rows = await prisma.rawQuery(
    `
    select website_id as "websiteId",
      coalesce(sum(request_count), 0)::int as requests,
      coalesce(sum(case when status_code >= 500 then request_count else 0 end), 0)::int as errors,
      coalesce(sum(latency_count), 0)::int as "latencyCount",
      ${columns}
    from ${table}
    where bucket_start >= {{start}} and bucket_start <= {{end}}
    ${filter}
    group by website_id
    `,
    { start, end, websiteIds },
    'operatorApiStats',
  );
  return rows.map((row: Record<string, number | string>) => ({
    websiteId: String(row.websiteId),
    requests: Number(row.requests),
    errors: Number(row.errors),
    latencyCount: Number(row.latencyCount),
    h5: Number(row.h5),
    h10: Number(row.h10),
    h25: Number(row.h25),
    h50: Number(row.h50),
    h100: Number(row.h100),
    h250: Number(row.h250),
    h500: Number(row.h500),
    h1000: Number(row.h1000),
    h2500: Number(row.h2500),
    h5000: Number(row.h5000),
    h10000: Number(row.h10000),
    hInf: Number(row.h_inf),
  }));
}

function asStatus(value: string): EnrollmentStatus {
  return value === 'pending' ? 'pending' : 'active';
}

export type UsagePoint = { t: string; site: number; visitors: number; api: number };

/** Daily, or hourly when the window is under two days. Sums match the pageview and request totals. */
export async function readUsageSeries(
  websiteIds: string[],
  start: Date,
  end: Date,
): Promise<UsagePoint[]> {
  if (websiteIds.length === 0) return [];
  const hour = end.getTime() - start.getTime() <= 2 * 24 * 60 * 60 * 1000;
  const siteRows = await prisma.rawQuery(
    `
    select to_char(date_trunc('${hour ? 'hour' : 'day'}', created_at at time zone 'utc'), '${
      hour ? 'YYYY-MM-DD"T"HH24:00:00"Z"' : 'YYYY-MM-DD'
    }') as t,
      count(*)::int as views,
      count(distinct session_id)::int as visitors
    from website_event
    where event_type = 1
      and created_at >= {{start}} and created_at <= {{end}}
      and website_id = any({{websiteIds}}::uuid[])
    group by 1
    order by 1
    `,
    { start, end, websiteIds },
    'usageSiteSeries',
  );
  const apiRows = await prisma.rawQuery(
    `
    select to_char(date_trunc('${hour ? 'hour' : 'day'}', bucket_start at time zone 'utc'), '${
      hour ? 'YYYY-MM-DD"T"HH24:00:00"Z"' : 'YYYY-MM-DD'
    }') as t,
      coalesce(sum(request_count), 0)::int as value
    from ${hour ? 'api_metric_hour' : 'api_metric_day'}
    where bucket_start >= {{start}} and bucket_start <= {{end}}
      and website_id = any({{websiteIds}}::uuid[])
    group by 1
    order by 1
    `,
    { start, end, websiteIds },
    'usageApiSeries',
  );
  const points = new Map<string, UsagePoint>();
  for (const row of siteRows as Array<{ t: string; views: number; visitors: number }>) {
    points.set(String(row.t), {
      t: String(row.t),
      site: Number(row.views),
      visitors: Number(row.visitors),
      api: 0,
    });
  }
  for (const row of apiRows as Array<{ t: string; value: number }>) {
    const key = String(row.t);
    const current = points.get(key) ?? { t: key, site: 0, visitors: 0, api: 0 };
    current.api = Number(row.value);
    points.set(key, current);
  }
  return [...points.values()].sort((left, right) => left.t.localeCompare(right.t));
}
