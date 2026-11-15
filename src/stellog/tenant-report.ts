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

const DAY_MS = 24 * 60 * 60 * 1000;
export const MAX_METRICS_RANGE_MS = 366 * DAY_MS;

export type MetricGrain = 'hour' | 'day';

export type MetricBucket = {
  websiteId: string;
  bucketStart: Date;
  route: string;
  statusCode: number;
  requestCount: number;
  latencyCount: number;
} & Hist;

export type LatencySummary = {
  p50: number | null;
  p95: number | null;
  p50Capped: boolean;
  p95Capped: boolean;
};

export type TenantMetrics = {
  websiteId: string;
  unit: MetricGrain;
  requests: number;
  p50: number | null;
  p95: number | null;
  p50Capped: boolean;
  p95Capped: boolean;
  series: Array<{ x: string; y: number }>;
  routes: Array<{ route: string; requests: number } & LatencySummary>;
  statuses: Array<{ statusCode: number; requests: number; share: number }>;
};

/** The only predicate a tenant read is allowed to use. */
export function tenantMetricsWhere(websiteId: string, start: Date, end: Date) {
  return {
    websiteId,
    bucketStart: { gte: start, lte: end },
  };
}

export function metricGrain(start: Date, end: Date, unit?: string): MetricGrain {
  if (unit === 'hour' || unit === 'minute') return 'hour';
  if (unit === 'day' || unit === 'week' || unit === 'month' || unit === 'year') return 'day';
  return end.getTime() - start.getTime() <= 2 * DAY_MS ? 'hour' : 'day';
}

export function summarizeTenantMetrics(
  websiteId: string,
  rows: MetricBucket[],
  unit: MetricGrain,
): TenantMetrics {
  const series = new Map<string, number>();
  const routes = new Map<string, { requests: number; hist: Hist }>();
  const statuses = new Map<number, number>();
  let requests = 0;
  let latency = emptyHist();

  for (const row of rows) {
    if (row.websiteId !== websiteId) continue;
    requests += row.requestCount;
    const rowLatency = latencyHist(row);
    latency = addHist(latency, rowLatency);
    const bucket = row.bucketStart.toISOString();
    series.set(bucket, (series.get(bucket) ?? 0) + row.requestCount);

    const route = routes.get(row.route) ?? { requests: 0, hist: emptyHist() };
    route.requests += row.requestCount;
    route.hist = addHist(route.hist, rowLatency);
    routes.set(row.route, route);

    statuses.set(row.statusCode, (statuses.get(row.statusCode) ?? 0) + row.requestCount);
  }

  return {
    websiteId,
    unit,
    requests,
    ...latencySummary(latency),
    series: [...series.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([x, y]) => ({ x, y })),
    routes: [...routes.entries()]
      .map(([route, value]) => ({
        route,
        requests: value.requests,
        ...latencySummary(value.hist),
      }))
      .sort(
        (left, right) => right.requests - left.requests || left.route.localeCompare(right.route),
      ),
    statuses: [...statuses.entries()]
      .map(([statusCode, count]) => ({
        statusCode,
        requests: count,
        share: requests === 0 ? 0 : count / requests,
      }))
      .sort((left, right) => right.requests - left.requests || left.statusCode - right.statusCode),
  };
}

function latencyHist(row: MetricBucket): Hist {
  if (row.latencyCount <= 0) return emptyHist();
  const hist = emptyHist();
  for (const key of HIST_KEYS) hist[key] = row[key];
  return hist;
}

function latencySummary(hist: Hist): LatencySummary {
  const p50 = percentileMs(hist, 0.5);
  const p95 = percentileMs(hist, 0.95);
  return {
    p50: finiteLatency(p50),
    p95: finiteLatency(p95),
    p50Capped: p50 === Number.POSITIVE_INFINITY,
    p95Capped: p95 === Number.POSITIVE_INFINITY,
  };
}

function finiteLatency(value: number | null): number | null {
  return value === null || !Number.isFinite(value) ? null : value;
}
