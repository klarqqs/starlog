import { addHist, emptyHist, type Hist, type HistKey, percentileMs } from '@/stellog/histogram';

const HIST_KEYS: HistKey[] = [
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
  'hInf',
];

export type ProjectType = 'team' | 'website';
export type EnrollmentStatus = 'active' | 'pending';
export type OperatorSort =
  | 'name'
  | 'pageviews'
  | 'visitors'
  | 'requests'
  | 'errors'
  | 'errorRate'
  | 'p95'
  | 'pageviewsGrowth'
  | 'visitorsGrowth'
  | 'requestsGrowth';

export type PropertyKind = 'site' | 'api';

export type OperatorWebsite = {
  id: string;
  name: string;
  teamId: string | null;
  status: EnrollmentStatus;
  domain?: string | null;
  kind?: PropertyKind;
};

export type OperatorTeam = {
  id: string;
  name: string;
  status: EnrollmentStatus;
};

export type WebStat = {
  websiteId: string;
  pageviews: number;
  visitors: number;
};

export type ApiStat = {
  websiteId: string;
  requests: number;
  errors: number;
  latencyCount: number;
} & Hist;

export type OperatorProject = {
  id: string;
  type: ProjectType;
  name: string;
  status: EnrollmentStatus;
  properties: number;
  pendingProperties: number;
  sites: number;
  apis: number;
  websiteIds: string[];
  /** Public site used for the project icon. A website domain wins over an api. domain. */
  domain: string | null;
  pageviews: number;
  visitors: number;
  requests: number;
  errors: number;
  errorRate: number;
  pageviewsPrevious: number;
  visitorsPrevious: number;
  requestsPrevious: number;
  pageviewsGrowth: number | null;
  visitorsGrowth: number | null;
  requestsGrowth: number | null;
  p50: number | null;
  p95: number | null;
  p50Capped: boolean;
  p95Capped: boolean;
};

export function projectId(type: ProjectType, id: string) {
  return `${type}:${id}`;
}

export function parseProjectId(value: string): { type: ProjectType; id: string } | null {
  const match =
    /^(team|website):([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.exec(value);
  if (!match) return null;
  return { type: match[1].toLowerCase() as ProjectType, id: match[2].toLowerCase() };
}

export function statusForEnrollment(
  mode: 'open' | 'approval-required',
  isAdmin: boolean,
  teamStatus?: EnrollmentStatus | null,
): EnrollmentStatus {
  if (isAdmin) return 'active';
  if (teamStatus === 'pending') return 'pending';
  return mode === 'approval-required' ? 'pending' : 'active';
}

/** "1 site, 1 API", "API only", or "Site only". Pending properties are not included. */
export function propertyLabel(sites: number, apis: number) {
  if (sites <= 0 && apis <= 0) return 'No properties';
  if (sites <= 0) return apis === 1 ? 'API only' : `${apis} APIs`;
  if (apis <= 0) return sites === 1 ? 'Site only' : `${sites} sites`;
  const siteText = sites === 1 ? '1 site' : `${sites} sites`;
  const apiText = apis === 1 ? '1 API' : `${apis} APIs`;
  return `${siteText}, ${apiText}`;
}

/**
 * The seeded histogram uses one shape for most profiles, so p50 and p95 match on every row.
 * A latency column that never changes looks broken. Show it only when the rows disagree.
 */
export function showLatency(rows: Array<{ p50: number | null; p95: number | null }>) {
  const distinct = new Set(
    rows
      .filter(row => row.p50 !== null || row.p95 !== null)
      .map(row => `${row.p50 ?? ''}:${row.p95 ?? ''}`),
  );
  return distinct.size > 1;
}

/** Prefer a public website over an api. hostname so the icon matches the product. */
export function projectDomain(current: string | null, next?: string | null) {
  if (!next) return current;
  if (!current) return next;
  if (current.startsWith('api.') && !next.startsWith('api.')) return next;
  return current;
}

/** Add or remove one id, and never keep more than `max` selected. */
export function limitSelection(selected: string[], id: string, max = 4): string[] {
  if (selected.includes(id)) return selected.filter(item => item !== id);
  if (selected.length >= max) return selected;
  return [...selected, id];
}

/** Fractional change versus the previous period. Null when the previous period was empty and this one is not. */
export function growthRate(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return (current - previous) / previous;
}

export function rankProjects(
  teams: OperatorTeam[],
  websites: OperatorWebsite[],
  webStats: WebStat[],
  apiStats: ApiStat[],
  options: {
    q?: string;
    status?: EnrollmentStatus | 'all';
    sort?: OperatorSort;
    order?: 'asc' | 'desc';
    previous?: { web: WebStat[]; api: ApiStat[] };
  } = {},
): OperatorProject[] {
  const knownWebsites = new Set(websites.map(website => website.id));
  const webById = new Map(
    webStats.filter(row => knownWebsites.has(row.websiteId)).map(row => [row.websiteId, row]),
  );
  const apiById = new Map(
    apiStats.filter(row => knownWebsites.has(row.websiteId)).map(row => [row.websiteId, row]),
  );
  const projects = new Map<string, OperatorProject & { hist: Hist }>();

  for (const team of teams) {
    projects.set(projectId('team', team.id), emptyProject('team', team.id, team.name, team.status));
  }

  for (const website of websites) {
    const teamKey = website.teamId ? projectId('team', website.teamId) : '';
    const project = website.teamId ? projects.get(teamKey) : undefined;
    const bucket = project ?? standalone(projects, website);
    bucket.domain = projectDomain(bucket.domain, website.domain);
    if (website.status === 'pending') {
      bucket.pendingProperties += 1;
      continue;
    }
    bucket.properties += 1;
    bucket.websiteIds.push(website.id);
    if (website.kind === 'api') bucket.apis += 1;
    else bucket.sites += 1;
    const web = webById.get(website.id);
    if (web) {
      bucket.pageviews += web.pageviews;
      bucket.visitors += web.visitors;
    }
    const api = apiById.get(website.id);
    if (!api) continue;
    bucket.requests += api.requests;
    bucket.errors += api.errors;
    if (api.latencyCount > 0) bucket.hist = addHist(bucket.hist, histOf(api));
  }

  const previousTotals = collectCounts(
    teams,
    websites,
    options.previous?.web ?? [],
    options.previous?.api ?? [],
  );

  const query = options.q?.trim().toLowerCase() ?? '';
  const status = options.status ?? 'active';
  const sort = options.sort ?? 'requests';
  const order = options.order ?? 'desc';

  return [...projects.values()]
    .map(project => withGrowth(finish(project), previousTotals.get(project.id)))
    .filter(project => (status === 'all' ? true : project.status === status))
    .filter(project => (query ? project.name.toLowerCase().includes(query) : true))
    .sort((left, right) => compareProjects(left, right, sort, order));
}

function standalone(
  projects: Map<string, OperatorProject & { hist: Hist }>,
  website: OperatorWebsite,
) {
  const id = projectId('website', website.id);
  const existing = projects.get(id);
  if (existing) return existing;
  const created = emptyProject('website', website.id, website.name, website.status);
  projects.set(id, created);
  return created;
}

function emptyProject(
  type: ProjectType,
  id: string,
  name: string,
  status: EnrollmentStatus,
): OperatorProject & { hist: Hist } {
  return {
    id: projectId(type, id),
    type,
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
    hist: emptyHist(),
  };
}

function finish(project: OperatorProject & { hist: Hist }): OperatorProject {
  const p50 = percentileMs(project.hist, 0.5);
  const p95 = percentileMs(project.hist, 0.95);
  const { hist, ...rest } = project;
  return {
    ...rest,
    errorRate: rest.requests === 0 ? 0 : rest.errors / rest.requests,
    p50: finite(p50),
    p95: finite(p95),
    p50Capped: p50 === Number.POSITIVE_INFINITY,
    p95Capped: p95 === Number.POSITIVE_INFINITY,
  };
}

function histOf(row: ApiStat): Hist {
  const hist = emptyHist();
  for (const key of HIST_KEYS) hist[key] = row[key];
  return hist;
}

function collectCounts(
  teams: OperatorTeam[],
  websites: OperatorWebsite[],
  webStats: WebStat[],
  apiStats: ApiStat[],
) {
  const totals = new Map<string, { pageviews: number; visitors: number; requests: number }>();
  for (const team of teams) {
    totals.set(projectId('team', team.id), { pageviews: 0, visitors: 0, requests: 0 });
  }
  const webById = new Map(webStats.map(row => [row.websiteId, row]));
  const apiById = new Map(apiStats.map(row => [row.websiteId, row]));
  for (const website of websites) {
    if (website.status === 'pending') continue;
    const id = website.teamId
      ? projectId('team', website.teamId)
      : projectId('website', website.id);
    const bucket = totals.get(id) ?? { pageviews: 0, visitors: 0, requests: 0 };
    const web = webById.get(website.id);
    const api = apiById.get(website.id);
    bucket.pageviews += web?.pageviews ?? 0;
    bucket.visitors += web?.visitors ?? 0;
    bucket.requests += api?.requests ?? 0;
    totals.set(id, bucket);
  }
  return totals;
}

function withGrowth(
  project: OperatorProject,
  previous: { pageviews: number; visitors: number; requests: number } | undefined,
): OperatorProject {
  const prior = previous ?? { pageviews: 0, visitors: 0, requests: 0 };
  return {
    ...project,
    pageviewsPrevious: prior.pageviews,
    visitorsPrevious: prior.visitors,
    requestsPrevious: prior.requests,
    pageviewsGrowth: growthRate(project.pageviews, prior.pageviews),
    visitorsGrowth: growthRate(project.visitors, prior.visitors),
    requestsGrowth: growthRate(project.requests, prior.requests),
  };
}

function finite(value: number | null) {
  return value === null || !Number.isFinite(value) ? null : value;
}

function compareProjects(
  left: OperatorProject,
  right: OperatorProject,
  sort: OperatorSort,
  order: 'asc' | 'desc',
) {
  const direction = order === 'asc' ? 1 : -1;
  const leftValue = sortValue(left, sort, order);
  const rightValue = sortValue(right, sort, order);
  if (typeof leftValue === 'string' || typeof rightValue === 'string') {
    return String(leftValue).localeCompare(String(rightValue)) * direction;
  }
  if (leftValue !== rightValue) return (leftValue - rightValue) * direction;
  return left.name.localeCompare(right.name);
}

function sortValue(project: OperatorProject, sort: OperatorSort, order: 'asc' | 'desc') {
  if (sort === 'name') return project.name.toLowerCase();
  if (sort === 'p95') {
    if (project.p95 === null) return order === 'asc' ? Number.POSITIVE_INFINITY : -1;
    return project.p95;
  }
  if (sort === 'pageviewsGrowth' || sort === 'visitorsGrowth' || sort === 'requestsGrowth') {
    const value = project[sort];
    if (value === null)
      return order === 'asc' ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY;
    return value;
  }
  return project[sort];
}
