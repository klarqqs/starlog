import { EVENT_TYPE } from '@/lib/constants';
import prisma from '@/lib/prisma';
import type { MetricRow } from '@/stellog/project-traffic';

export type ReportRow = Record<string, string | number | null>;

export type ProjectReport = {
  section: string;
  rows: ReportRow[];
  lists?: Record<string, MetricRow[]>;
  stats?: Record<string, number | null>;
};

const SAVED: Record<string, { model: 'report' | 'segment'; type: string; page: string }> = {
  goals: { model: 'report', type: 'goal', page: 'goals' },
  funnels: { model: 'report', type: 'funnel', page: 'funnels' },
  journeys: { model: 'report', type: 'journey', page: 'journeys' },
  retention: { model: 'report', type: 'retention', page: 'retention' },
  segments: { model: 'segment', type: 'segment', page: 'segments' },
  cohorts: { model: 'segment', type: 'cohort', page: 'cohorts' },
};

export async function readProjectReport(
  section: string,
  websites: { id: string; name: string }[],
  start: Date,
  end: Date,
): Promise<ProjectReport> {
  const names = new Map(websites.map(website => [website.id, website.name]));
  const ids = websites.map(website => website.id);
  if (ids.length === 0) return { section, rows: [] };

  if (SAVED[section]) return saved(section, ids, names);
  if (section === 'events') return events(section, ids, start, end);
  if (section === 'sessions') return sessions(section, ids, names, start, end);
  if (section === 'compare') return compare(section, ids, names, start, end);
  if (section === 'breakdown') return breakdown(section, ids, start, end);
  if (section === 'utm') return utm(section, ids, names, start, end);
  if (section === 'attribution') return attribution(section, ids, start, end);
  if (section === 'realtime') return realtime(section, ids);
  if (section === 'performance') return performance(section, ids, start, end);
  if (section === 'errors') return errors(section, ids, names, start, end);
  return { section, rows: [] };
}

async function saved(
  section: string,
  ids: string[],
  names: Map<string, string>,
): Promise<ProjectReport> {
  const spec = SAVED[section];
  const rows =
    spec.model === 'report'
      ? await prisma.client.report.findMany({
          where: { websiteId: { in: ids }, type: spec.type },
          select: { id: true, name: true, websiteId: true },
          orderBy: { name: 'asc' },
          take: 100,
        })
      : await prisma.client.segment.findMany({
          where: { websiteId: { in: ids }, type: spec.type },
          select: { id: true, name: true, websiteId: true },
          orderBy: { name: 'asc' },
          take: 100,
        });

  return {
    section,
    rows: rows.map(row => ({
      id: row.id,
      name: row.name,
      websiteId: row.websiteId,
      website: names.get(row.websiteId) ?? '',
      href: `/websites/${row.websiteId}/${spec.page}`,
    })),
  };
}

async function events(
  section: string,
  ids: string[],
  start: Date,
  end: Date,
): Promise<ProjectReport> {
  const params = { websiteIds: ids, start, end };
  const rows = await prisma.rawQuery(
    `
    select coalesce(nullif(event_name, ''), 'event') as name, count(*)::int as count
    from website_event
    where website_id = any({{websiteIds}}::uuid[])
      and created_at between {{start}} and {{end}}
      and event_type = ${EVENT_TYPE.customEvent}
    group by 1
    order by count desc
    limit 50
    `,
    params,
    'projectReportEvents',
  );
  const list = (rows ?? []).map((row: { name: string; count: number }) => ({
    name: String(row.name),
    count: Number(row.count) || 0,
  }));
  return {
    section,
    rows: list,
    stats: { total: list.reduce((sum, row) => sum + row.count, 0) },
  };
}

async function sessions(
  section: string,
  ids: string[],
  names: Map<string, string>,
  start: Date,
  end: Date,
): Promise<ProjectReport> {
  const rows = await prisma.rawQuery(
    `
    select
      session.session_id as id,
      session.website_id as "websiteId",
      session.browser,
      session.os,
      session.device,
      session.country,
      session.created_at as "createdAt",
      count(website_event.event_id) filter (where website_event.event_type = ${EVENT_TYPE.pageView})::int as views
    from session
    left join website_event on website_event.session_id = session.session_id
    where session.website_id = any({{websiteIds}}::uuid[])
      and session.created_at between {{start}} and {{end}}
    group by session.session_id, session.website_id, session.browser, session.os, session.device, session.country, session.created_at
    order by session.created_at desc
    limit 50
    `,
    { websiteIds: ids, start, end },
    'projectReportSessions',
  );
  return {
    section,
    rows: (rows ?? []).map((row: Record<string, unknown>) => ({
      id: String(row.id),
      websiteId: String(row.websiteId),
      website: names.get(String(row.websiteId)) ?? '',
      browser: text(row.browser),
      os: text(row.os),
      device: text(row.device),
      country: text(row.country),
      views: Number(row.views) || 0,
      createdAt: row.createdAt ? new Date(row.createdAt as string).toISOString() : '',
      href: `/websites/${row.websiteId}/sessions`,
    })),
  };
}

async function compare(
  section: string,
  ids: string[],
  names: Map<string, string>,
  start: Date,
  end: Date,
): Promise<ProjectReport> {
  const rows = await prisma.rawQuery(
    `
    select
      website_id as "websiteId",
      count(*) filter (where event_type = ${EVENT_TYPE.pageView})::int as views,
      count(distinct session_id) filter (where event_type = ${EVENT_TYPE.pageView})::int as visitors
    from website_event
    where website_id = any({{websiteIds}}::uuid[])
      and created_at between {{start}} and {{end}}
    group by website_id
    `,
    { websiteIds: ids, start, end },
    'projectReportCompare',
  );
  const byId = new Map<string, { views: number; visitors: number }>(
    (rows ?? []).map(
      (row: {
        websiteId: string;
        views: number;
        visitors: number;
      }): [string, { views: number; visitors: number }] => [
        String(row.websiteId),
        { views: Number(row.views) || 0, visitors: Number(row.visitors) || 0 },
      ],
    ),
  );
  return {
    section,
    rows: ids
      .map(id => ({
        websiteId: id,
        website: names.get(id) ?? '',
        visitors: byId.get(id)?.visitors ?? 0,
        views: byId.get(id)?.views ?? 0,
        href: `/websites/${id}`,
      }))
      .sort((a, b) => b.visitors - a.visitors || a.website.localeCompare(b.website)),
  };
}

async function breakdown(
  section: string,
  ids: string[],
  start: Date,
  end: Date,
): Promise<ProjectReport> {
  const params = { websiteIds: ids, start, end };
  const [browser, os, device, country] = await Promise.all([
    column('browser', params),
    column('os', params),
    column('device', params),
    column('country', params),
  ]);
  return { section, rows: [], lists: { browser, os, device, country } };
}

async function utm(
  section: string,
  ids: string[],
  names: Map<string, string>,
  start: Date,
  end: Date,
): Promise<ProjectReport> {
  const rows = await prisma.rawQuery(
    `
    select
      website_id as "websiteId",
      coalesce(nullif(utm_source, ''), '') as source,
      coalesce(nullif(utm_medium, ''), '') as medium,
      coalesce(nullif(utm_campaign, ''), '') as campaign,
      count(distinct session_id)::int as visitors
    from website_event
    where website_id = any({{websiteIds}}::uuid[])
      and created_at between {{start}} and {{end}}
      and (
        coalesce(utm_source, '') <> ''
        or coalesce(utm_medium, '') <> ''
        or coalesce(utm_campaign, '') <> ''
      )
    group by 1, 2, 3, 4
    order by visitors desc
    limit 50
    `,
    { websiteIds: ids, start, end },
    'projectReportUtm',
  );
  return {
    section,
    rows: (rows ?? []).map((row: Record<string, unknown>) => ({
      website: names.get(String(row.websiteId)) ?? '',
      source: text(row.source),
      medium: text(row.medium),
      campaign: text(row.campaign),
      visitors: Number(row.visitors) || 0,
      href: `/websites/${row.websiteId}/utm`,
    })),
  };
}

async function attribution(
  section: string,
  ids: string[],
  start: Date,
  end: Date,
): Promise<ProjectReport> {
  const rows = await prisma.rawQuery(
    `
    select referrer_domain as source, count(distinct session_id)::int as visitors
    from website_event
    where website_id = any({{websiteIds}}::uuid[])
      and created_at between {{start}} and {{end}}
      and coalesce(referrer_domain, '') <> ''
    group by 1
    order by visitors desc
    limit 50
    `,
    { websiteIds: ids, start, end },
    'projectReportAttribution',
  );
  return {
    section,
    rows: (rows ?? []).map((row: { source: string; visitors: number }) => ({
      source: String(row.source),
      visitors: Number(row.visitors) || 0,
    })),
  };
}

async function realtime(section: string, ids: string[]): Promise<ProjectReport> {
  const params = { websiteIds: ids };
  const [active, pages] = await Promise.all([
    prisma.rawQuery(
      `
      select count(distinct session_id)::int as visitors
      from website_event
      where website_id = any({{websiteIds}}::uuid[])
        and created_at >= now() - interval '5 minutes'
        and event_type = ${EVENT_TYPE.pageView}
      `,
      params,
      'projectReportRealtime',
    ),
    prisma.rawQuery(
      `
      select url_path as x, count(distinct session_id)::int as y
      from website_event
      where website_id = any({{websiteIds}}::uuid[])
        and created_at >= now() - interval '5 minutes'
        and event_type = ${EVENT_TYPE.pageView}
        and url_path <> ''
      group by 1
      order by y desc
      limit 10
      `,
      params,
      'projectReportRealtimePages',
    ),
  ]);
  return {
    section,
    rows: [],
    stats: { visitors: Number(active?.[0]?.visitors) || 0 },
    lists: {
      path: (pages ?? []).map((row: { x: string; y: number }) => ({
        x: String(row.x),
        y: Number(row.y) || 0,
      })),
    },
  };
}

async function performance(
  section: string,
  ids: string[],
  start: Date,
  end: Date,
): Promise<ProjectReport> {
  const rows = await prisma.rawQuery(
    `
    select
      avg(lcp)::float as lcp,
      avg(inp)::float as inp,
      avg(cls)::float as cls,
      avg(fcp)::float as fcp,
      avg(ttfb)::float as ttfb,
      count(*)::int as samples
    from website_event
    where website_id = any({{websiteIds}}::uuid[])
      and created_at between {{start}} and {{end}}
      and event_type = ${EVENT_TYPE.performance}
    `,
    { websiteIds: ids, start, end },
    'projectReportPerformance',
  );
  const row = rows?.[0] ?? {};
  return {
    section,
    rows: [],
    stats: {
      lcp: numberOrNull(row.lcp),
      inp: numberOrNull(row.inp),
      cls: numberOrNull(row.cls),
      fcp: numberOrNull(row.fcp),
      ttfb: numberOrNull(row.ttfb),
      samples: Number(row.samples) || 0,
    },
  };
}

async function errors(
  section: string,
  ids: string[],
  names: Map<string, string>,
  start: Date,
  end: Date,
): Promise<ProjectReport> {
  const issues = await prisma.client.errorIssue.findMany({
    where: { websiteId: { in: ids } },
    select: { id: true, title: true, status: true, websiteId: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  const counts = await prisma.rawQuery(
    `
    select issue_id as "issueId", count(*)::int as events
    from error_event
    where website_id = any({{websiteIds}}::uuid[])
      and created_at between {{start}} and {{end}}
    group by 1
    `,
    { websiteIds: ids, start, end },
    'projectReportErrors',
  );
  const byIssue = new Map<string, number>(
    (counts ?? []).map((row: { issueId: string; events: number }): [string, number] => [
      String(row.issueId),
      Number(row.events) || 0,
    ]),
  );
  return {
    section,
    rows: issues.map(issue => ({
      id: issue.id,
      title: issue.title,
      status: issue.status,
      website: names.get(issue.websiteId) ?? '',
      events: byIssue.get(issue.id) ?? 0,
      href: `/websites/${issue.websiteId}/errors/${issue.id}`,
    })),
  };
}

async function column(
  name: 'browser' | 'os' | 'device' | 'country',
  params: Record<string, unknown>,
) {
  const rows = await prisma.rawQuery(
    `
    select session.${name} as x, count(distinct website_event.session_id)::int as y
    from website_event
    join session on session.session_id = website_event.session_id
    where website_event.website_id = any({{websiteIds}}::uuid[])
      and website_event.created_at between {{start}} and {{end}}
      and website_event.event_type = ${EVENT_TYPE.pageView}
    group by 1
    order by y desc
    limit 20
    `,
    params,
    'projectReportBreakdown',
  );
  return (rows ?? [])
    .map((row: { x: unknown; y: unknown }) => ({
      x: String(row.x ?? '').trim(),
      y: Number(row.y) || 0,
    }))
    .filter(row => row.x !== '');
}

function text(value: unknown) {
  const next = String(value ?? '').trim();
  return next || null;
}

function numberOrNull(value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  const next = Number(value);
  return Number.isFinite(next) ? next : null;
}
