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
export type OperatorSort = 'name' | 'pageviews' | 'visitors' | 'requests' | 'errors' | 'p95';

export type OperatorWebsite = {
  id: string;
  name: string;
  teamId: string | null;
  status: EnrollmentStatus;
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
  websiteIds: string[];
  pageviews: number;
  visitors: number;
  requests: number;
  errors: number;
  errorRate: number;
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
    if (website.status === 'pending') {
      bucket.pendingProperties += 1;
      continue;
    }
    bucket.properties += 1;
    bucket.websiteIds.push(website.id);
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

  const query = options.q?.trim().toLowerCase() ?? '';
  const status = options.status ?? 'active';
  const sort = options.sort ?? 'requests';
  const order = options.order ?? 'desc';

  return [...projects.values()]
    .map(finish)
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
    websiteIds: [],
    pageviews: 0,
    visitors: 0,
    requests: 0,
    errors: 0,
    errorRate: 0,
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
  return project[sort];
}
