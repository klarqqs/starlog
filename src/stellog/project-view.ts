import prisma from '@/lib/prisma';
import { apiStatsFor, webStatsFor } from '@/stellog/operator-metrics';
import {
  type EnrollmentStatus,
  type OperatorProject,
  type PropertyKind,
  rankProjects,
} from '@/stellog/operator-report';
import { metricGrain } from '@/stellog/tenant-report';

export type ProjectProperty = {
  id: string;
  name: string;
  domain: string | null;
  kind: PropertyKind;
  status: EnrollmentStatus;
  pageviews: number;
  visitors: number;
  requests: number;
  errors: number;
  errorRate: number;
};

export type ProjectView = {
  project: OperatorProject;
  sites: ProjectProperty[];
  apis: ProjectProperty[];
};

/** One funded project: its summary, its sites, and its APIs. */
export async function readProjectView(
  teamId: string,
  start: Date,
  end: Date,
  unit?: string,
): Promise<ProjectView | null> {
  const team = await prisma.client.team.findFirst({
    where: { id: teamId, deletedAt: null },
    select: { id: true, name: true, enrollmentStatus: true },
  });
  if (!team) return null;

  const websites = await prisma.client.website.findMany({
    where: { teamId, deletedAt: null },
    select: {
      id: true,
      name: true,
      domain: true,
      kind: true,
      enrollmentStatus: true,
    },
    orderBy: { name: 'asc' },
  });
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
  const status = asStatus(team.enrollmentStatus);
  const rows = websites.map(website => ({
    id: website.id,
    name: website.name,
    teamId,
    status: asStatus(website.enrollmentStatus),
    domain: website.domain,
    kind: website.kind === 'api' ? ('api' as const) : ('site' as const),
  }));
  const [project] = rankProjects([{ id: team.id, name: team.name, status }], rows, web, api, {
    status: 'all',
    previous: { web: previousWeb, api: previousApi },
  });
  const webById = new Map(web.map(row => [row.websiteId, row]));
  const apiById = new Map(api.map(row => [row.websiteId, row]));
  const properties = rows.map(website => {
    const pageviews = webById.get(website.id)?.pageviews ?? 0;
    const visitors = webById.get(website.id)?.visitors ?? 0;
    const requests = apiById.get(website.id)?.requests ?? 0;
    const errors = apiById.get(website.id)?.errors ?? 0;
    return {
      id: website.id,
      name: website.name,
      domain: website.domain,
      kind: website.kind,
      status: website.status,
      pageviews,
      visitors,
      requests,
      errors,
      errorRate: requests ? errors / requests : 0,
    };
  });

  return {
    project: project ?? emptyProject(team.id, team.name, status),
    sites: properties.filter(property => property.kind === 'site'),
    apis: properties.filter(property => property.kind === 'api'),
  };
}

function asStatus(value: string): EnrollmentStatus {
  return value === 'pending' ? 'pending' : 'active';
}

function emptyProject(id: string, name: string, status: EnrollmentStatus): OperatorProject {
  return {
    id: `team:${id}`,
    type: 'team',
    name,
    status,
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
