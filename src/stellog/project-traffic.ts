import { EVENT_TYPE } from '@/lib/constants';
import prisma from '@/lib/prisma';
import { chartUnit, emptyWeekly, sqlTimezone } from '@/stellog/project-window';

export { chartUnit, emptyWeekly, sqlTimezone } from '@/stellog/project-window';

export type MetricRow = { x: string; y: number };

export type TrafficStats = {
  pageviews: number;
  visitors: number;
  visits: number;
  bounces: number;
  totaltime: number;
};

export type ProjectNote = { id: string; date: string; note: string; allDay: boolean };

export type ProjectTraffic = {
  websites: { id: string; name: string }[];
  stats: TrafficStats;
  previous: TrafficStats;
  pageviews: MetricRow[];
  sessions: MetricRow[];
  pages: { path: MetricRow[]; url: MetricRow[]; entry: MetricRow[]; exit: MetricRow[] };
  sources: { referrer: MetricRow[]; channel: MetricRow[] };
  environment: { browser: MetricRow[]; os: MetricRow[]; device: MetricRow[] };
  location: { country: MetricRow[]; region: MetricRow[]; city: MetricRow[] };
  weekly: number[][];
  notes: ProjectNote[];
};

const ZERO: TrafficStats = { pageviews: 0, visitors: 0, visits: 0, bounces: 0, totaltime: 0 };

/** Sites the account owns or reaches through a team. Operators see every site. */
export async function websitesForUser(userId: string, all: boolean) {
  return prisma.client.website.findMany({
    where: all
      ? { deletedAt: null }
      : {
          deletedAt: null,
          OR: [{ userId }, { team: { deletedAt: null, members: { some: { userId } } } }],
        },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });
}

export async function readProjectTraffic(
  websites: { id: string; name: string }[],
  start: Date,
  end: Date,
  unit?: string,
  timezone?: string,
): Promise<ProjectTraffic> {
  if (websites.length === 0) return emptyTraffic([]);

  const ids = websites.map(website => website.id);
  const length = end.getTime() - start.getTime();
  const previousEnd = new Date(start.getTime() - 1);
  const previousStart = new Date(previousEnd.getTime() - length);
  const zone = sqlTimezone(timezone);
  const bucket = prisma.getDateSQL('website_event.created_at', chartUnit(unit), zone);
  const where = `
    website_event.website_id = any({{websiteIds}}::uuid[])
    and website_event.created_at between {{start}} and {{end}}
  `;
  const params = { websiteIds: ids, start, end };
  const page = `and website_event.event_type = ${EVENT_TYPE.pageView}`;
  const tracked = `and website_event.event_type not in (${EVENT_TYPE.customEvent}, ${EVENT_TYPE.performance})`;

  const [
    stats,
    previous,
    pageviews,
    sessions,
    path,
    url,
    entry,
    exit,
    referrer,
    channel,
    browser,
    os,
    device,
    country,
    region,
    city,
    weekly,
    notes,
  ] = await Promise.all([
    readStats(params),
    readStats({ websiteIds: ids, start: previousStart, end: previousEnd }),
    series(`count(*)::int`, `${where} ${tracked}`, bucket, params),
    series(`count(distinct website_event.session_id)::int`, `${where} ${tracked}`, bucket, params),
    grouped(`website_event.url_path`, `${where} ${page} and website_event.url_path <> ''`, params),
    grouped(
      `coalesce(nullif(website_event.hostname, ''), '') || website_event.url_path`,
      `${where} ${page} and website_event.url_path <> ''`,
      params,
    ),
    edges('asc', params),
    edges('desc', params),
    grouped(
      `website_event.referrer_domain`,
      `${where} ${tracked} and coalesce(website_event.referrer_domain, '') <> ''`,
      params,
    ),
    grouped(CHANNEL_SQL, `${where} ${tracked}`, params),
    sessionColumn('browser', params),
    sessionColumn('os', params),
    sessionColumn('device', params),
    sessionColumn('country', params),
    sessionColumn('region', params),
    sessionColumn('city', params),
    readWeekly(zone, params),
    readNotes(ids, start, end),
  ]);

  return {
    websites,
    stats,
    previous,
    pageviews,
    sessions,
    pages: { path, url, entry, exit },
    sources: { referrer, channel },
    environment: { browser, os, device },
    location: { country, region, city },
    weekly,
    notes,
  };
}

function emptyTraffic(websites: { id: string; name: string }[]): ProjectTraffic {
  return {
    websites,
    stats: ZERO,
    previous: ZERO,
    pageviews: [],
    sessions: [],
    pages: { path: [], url: [], entry: [], exit: [] },
    sources: { referrer: [], channel: [] },
    environment: { browser: [], os: [], device: [] },
    location: { country: [], region: [], city: [] },
    weekly: emptyWeekly(),
    notes: [],
  };
}

async function readStats(params: Record<string, unknown>): Promise<TrafficStats> {
  const diff = prisma.getTimestampDiffSQL('t.min_time', 't.max_time');
  const rows = await prisma.rawQuery(
    `
    select
      cast(coalesce(sum(t.c), 0) as bigint) as pageviews,
      count(distinct t.session_id) as visitors,
      count(distinct t.visit_id) as visits,
      coalesce(sum(case when t.c = 1 and t.has_custom_event = 0 then 1 else 0 end), 0) as bounces,
      cast(coalesce(sum(${diff}), 0) as bigint) as totaltime
    from (
      select
        website_event.session_id,
        website_event.visit_id,
        sum(case when website_event.event_type not in (2, 5) then 1 else 0 end) as c,
        min(case when website_event.event_type not in (2, 5) then website_event.created_at end) as min_time,
        max(case when website_event.event_type not in (2, 5) then website_event.created_at end) as max_time,
        max(case when website_event.event_type = ${EVENT_TYPE.customEvent} then 1 else 0 end) as has_custom_event
      from website_event
      where website_event.website_id = any({{websiteIds}}::uuid[])
        and website_event.created_at between {{start}} and {{end}}
        and website_event.event_type != ${EVENT_TYPE.performance}
      group by 1, 2
      having sum(case when website_event.event_type not in (2, 5) then 1 else 0 end) > 0
    ) as t
    `,
    params,
    'projectTrafficStats',
  );
  const row = rows?.[0] ?? {};
  return {
    pageviews: Number(row.pageviews) || 0,
    visitors: Number(row.visitors) || 0,
    visits: Number(row.visits) || 0,
    bounces: Number(row.bounces) || 0,
    totaltime: Number(row.totaltime) || 0,
  };
}

async function series(
  value: string,
  where: string,
  bucket: string,
  params: Record<string, unknown>,
) {
  const rows = await prisma.rawQuery(
    `
    select ${bucket} as x, ${value} as y
    from website_event
    where ${where}
    group by 1
    order by 1
    `,
    params,
    'projectTrafficSeries',
  );
  return (rows ?? []).map((row: { x: unknown; y: unknown }) => ({
    x: String(row.x ?? ''),
    y: Number(row.y) || 0,
  }));
}

async function grouped(expression: string, where: string, params: Record<string, unknown>) {
  const rows = await prisma.rawQuery(
    `
    select ${expression} as x, count(distinct website_event.session_id)::int as y
    from website_event
    where ${where}
    group by 1
    order by y desc
    limit 10
    `,
    params,
    'projectTrafficGrouped',
  );
  return (rows ?? [])
    .map((row: { x: unknown; y: unknown }) => ({
      x: String(row.x ?? '').trim(),
      y: Number(row.y) || 0,
    }))
    .filter(row => row.x !== '');
}

async function edges(direction: 'asc' | 'desc', params: Record<string, unknown>) {
  const rows = await prisma.rawQuery(
    `
    select url_path as x, count(*)::int as y
    from (
      select distinct on (visit_id) url_path
      from website_event
      where website_id = any({{websiteIds}}::uuid[])
        and created_at between {{start}} and {{end}}
        and event_type = ${EVENT_TYPE.pageView}
        and url_path <> ''
      order by visit_id, created_at ${direction}
    ) as pages
    group by 1
    order by y desc
    limit 10
    `,
    params,
    'projectTrafficEdges',
  );
  return (rows ?? [])
    .map((row: { x: unknown; y: unknown }) => ({
      x: String(row.x ?? '').trim(),
      y: Number(row.y) || 0,
    }))
    .filter(row => row.x !== '');
}

async function sessionColumn(
  column: 'browser' | 'os' | 'device' | 'country' | 'region' | 'city',
  params: Record<string, unknown>,
) {
  const rows = await prisma.rawQuery(
    `
    select session.${column} as x, count(distinct website_event.session_id)::int as y
    from website_event
    join session on session.session_id = website_event.session_id
    where website_event.website_id = any({{websiteIds}}::uuid[])
      and website_event.created_at between {{start}} and {{end}}
      and website_event.event_type = ${EVENT_TYPE.pageView}
    group by 1
    order by y desc
    limit 10
    `,
    params,
    'projectTrafficSession',
  );
  return (rows ?? [])
    .map((row: { x: unknown; y: unknown }) => ({
      x: String(row.x ?? '').trim(),
      y: Number(row.y) || 0,
    }))
    .filter(row => row.x !== '');
}

async function readWeekly(zone: string, params: Record<string, unknown>) {
  const rows = await prisma.rawQuery(
    `
    select
      extract(dow from (website_event.created_at at time zone '${zone}'))::int as dow,
      extract(hour from (website_event.created_at at time zone '${zone}'))::int as hour,
      count(distinct website_event.session_id)::int as y
    from website_event
    where website_event.website_id = any({{websiteIds}}::uuid[])
      and website_event.created_at between {{start}} and {{end}}
      and website_event.event_type = ${EVENT_TYPE.pageView}
    group by 1, 2
    `,
    params,
    'projectTrafficWeekly',
  );
  const days = emptyWeekly();
  for (const row of rows ?? []) {
    const dow = Number(row.dow);
    const hour = Number(row.hour);
    if (dow >= 0 && dow < 7 && hour >= 0 && hour < 24) days[dow][hour] = Number(row.y) || 0;
  }
  return days;
}

async function readNotes(ids: string[], start: Date, end: Date): Promise<ProjectNote[]> {
  const notes = await prisma.client.annotation.findMany({
    where: { websiteId: { in: ids }, date: { gte: start, lte: end } },
    select: { id: true, date: true, note: true, allDay: true },
    orderBy: { date: 'asc' },
    take: 50,
  });
  return notes.map(note => ({
    id: note.id,
    date: note.date.toISOString(),
    note: note.note,
    allDay: note.allDay,
  }));
}

const CHANNEL_SQL = `case
  when coalesce(website_event.referrer_domain, '') = '' then ''
  when website_event.referrer_domain ilike '%google.%'
    or website_event.referrer_domain ilike '%bing.%'
    or website_event.referrer_domain ilike '%duckduckgo.%'
    or website_event.referrer_domain ilike '%yahoo.%'
    or website_event.referrer_domain ilike '%baidu.%'
    or website_event.referrer_domain ilike '%yandex.%' then 'organicSearch'
  when website_event.referrer_domain ilike '%facebook.%'
    or website_event.referrer_domain ilike '%instagram.%'
    or website_event.referrer_domain ilike '%twitter.%'
    or website_event.referrer_domain ilike '%linkedin.%'
    or website_event.referrer_domain ilike '%reddit.%'
    or website_event.referrer_domain in ('t.co', 'x.com') then 'organicSocial'
  when website_event.referrer_domain ilike '%youtube.%'
    or website_event.referrer_domain ilike '%vimeo.%' then 'organicVideo'
  when website_event.referrer_domain ilike '%mail.%'
    or website_event.referrer_domain ilike '%outlook.%' then 'email'
  else 'referral'
end`;
