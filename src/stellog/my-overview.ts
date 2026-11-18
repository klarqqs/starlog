import prisma from '@/lib/prisma';
import { apiStatsFor, webStatsFor } from '@/stellog/operator-metrics';
import { type OperatorProject, rankProjects } from '@/stellog/operator-report';
import { metricGrain } from '@/stellog/tenant-report';

const ALL_SITES = '00000000-0000-4000-8000-0000000000a1';

export type MySite = OperatorProject & {
  websiteId: string;
  domain: string | null;
  kind: 'site' | 'api';
  teamId: string | null;
  teamName: string | null;
};

export type MyOverview = {
  totals: OperatorProject;
  sites: MySite[];
};

/** Sites and APIs the signed-in account owns or reaches through a team. */
export async function readMyOverview(
  userId: string,
  start: Date,
  end: Date,
  unit?: string,
  all = false,
): Promise<MyOverview> {
  const websites = await prisma.client.website.findMany({
    where: all
      ? { deletedAt: null }
      : {
          deletedAt: null,
          OR: [{ userId }, { team: { deletedAt: null, members: { some: { userId } } } }],
        },
    select: {
      id: true,
      name: true,
      domain: true,
      enrollmentStatus: true,
      teamId: true,
      kind: true,
      team: { select: { name: true } },
    },
    orderBy: { name: 'asc' },
  });
  if (websites.length === 0) return { totals: emptyTotals(), sites: [] };

  const ids = websites.map(website => website.id);
  const length = end.getTime() - start.getTime();
  const previousEnd = new Date(start.getTime() - 1);
  const previousStart = new Date(previousEnd.getTime() - length);
  const grain = metricGrain(start, end, unit);
  const [web, api, previousWeb, previousApi] = await Promise.all([
    webStatsFor(start, end, ids),
    apiStatsFor(start, end, grain, ids),
    webStatsFor(previousStart, previousEnd, ids),
    apiStatsFor(previousStart, previousEnd, grain, ids),
  ]);
  const previous = { web: previousWeb, api: previousApi };
  const rows = websites.map(website => ({
    id: website.id,
    name: website.name,
    teamId: null,
    status: (website.enrollmentStatus === 'pending' ? 'pending' : 'active') as 'pending' | 'active',
    kind: website.kind === 'api' ? ('api' as const) : ('site' as const),
  }));
  const ranked = rankProjects([], rows, web, api, { status: 'all', previous });
  const byId = new Map(ranked.map(project => [project.id, project]));

  const sites: MySite[] = websites.map(website => {
    const project = byId.get(`website:${website.id}`);
    return {
      ...(project ?? emptyTotals()),
      id: `website:${website.id}`,
      type: 'website',
      name: website.name,
      websiteId: website.id,
      domain: website.domain,
      kind: website.kind === 'api' ? 'api' : 'site',
      teamId: website.teamId,
      teamName: website.team?.name ?? null,
    };
  });

  const [totals] = rankProjects(
    [{ id: ALL_SITES, name: 'All sites', status: 'active' }],
    websites.map(website => ({
      id: website.id,
      name: website.name,
      teamId: ALL_SITES,
      status: (website.enrollmentStatus === 'pending' ? 'pending' : 'active') as
        | 'pending'
        | 'active',
      kind: website.kind === 'api' ? ('api' as const) : ('site' as const),
    })),
    web,
    api,
    { status: 'all', previous },
  );

  return { totals: totals ?? emptyTotals(), sites };
}

function emptyTotals(): OperatorProject {
  return {
    id: `team:${ALL_SITES}`,
    type: 'team',
    name: 'All sites',
    status: 'active',
    properties: 0,
    pendingProperties: 0,
    sites: 0,
    apis: 0,
    websiteIds: [],
    domain: null,
    pageviews: 0,
    visitors: 0,
    requests: 0,
    errors: 0,
    errorRate: 0,
    pageviewsPrevious: 0,
    visitorsPrevious: 0,
    requestsPrevious: 0,
    pageviewsGrowth: 0,
    visitorsGrowth: 0,
    requestsGrowth: 0,
    p50: null,
    p95: null,
    p50Capped: false,
    p95Capped: false,
  };
}
