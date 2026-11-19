import { type Hist, histForPercentiles, percentileMs } from '@/stellog/histogram';

/** Two years, so a 12-month window still has a full previous window. */
export const HISTORY_DAYS = 800;

const WEEK = [0.78, 1.02, 1.08, 1.1, 1.06, 0.96, 0.72];
export const ROUTES = ['/health', '/accounts/{id}', '/tx/{hash}', '/payments/{id}'] as const;
const ROUTE_SCALE: Record<(typeof ROUTES)[number], { p50: number; p95: number }> = {
  '/health': { p50: 0.4, p95: 0.42 },
  '/accounts/{id}': { p50: 0.85, p95: 0.82 },
  '/tx/{hash}': { p50: 1.1, p95: 1.05 },
  '/payments/{id}': { p50: 1.65, p95: 1.45 },
};

export type DemoKind = 'web' | 'api' | 'both';

export type DemoPoint = {
  pageviews: number;
  requests: number;
  errors: number;
};

const SLOW_PROJECTS = new Set(['Liqvid', 'JetPad']);

export function displayedTrend(value: number | null): number | null {
  if (value === null || !Number.isFinite(value)) return value;
  return Math.min(0.4, Math.max(-0.08, value));
}

export function stableUuid(key: string): string {
  const rand = mulberry32(hash(`stellog-id:${key}`));
  const bytes = Array.from({ length: 16 }, () => Math.floor(rand() * 256));
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = bytes.map(value => value.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function isSlowProject(name: string) {
  return SLOW_PROJECTS.has(name);
}

export function errorRateFor(index: number) {
  return Math.round((0.003 + (index % 25) * 0.0004) * 10000) / 10000;
}

/** About -7% to +36% over the latest 30 days. Older days stay at the base volume. */
export function trendTarget(name: string) {
  return Math.round((-0.07 + unit(name, 0, 'trend') * 0.43) * 1000) / 1000;
}

export function demoPoint(
  name: string,
  index: number,
  _kind: DemoKind,
  dayIndex: number,
  now = new Date(),
): DemoPoint {
  const date = dayDate(dayIndex, now);
  const season = WEEK[date.getUTCDay()] ?? 1;
  const noise = 0.98 + unit(name, dayIndex, 'noise') * 0.04;
  const lift = dayIndex >= HISTORY_DAYS - 30 ? 1 + trendTarget(name) : 1;
  const views = Math.max(1, Math.round((10 + index * 1.4) * season * noise * lift));
  const requests = Math.max(views + 1, Math.round(views * (36 + index)));
  const errors = errorsFor(requests, errorRateFor(index));
  return { pageviews: views, requests, errors };
}

function errorsFor(requests: number, rate: number) {
  if (requests <= 0 || rate <= 0) return 0;
  return Math.min(requests, Math.max(1, Math.ceil(requests * rate - 1e-9)));
}

export function projectLatency(name: string) {
  const p50 = 24 + Math.round(unit(name, 0, 'p50') * 16);
  const p95 = isSlowProject(name)
    ? 185 + Math.round(unit(name, 0, 'p95') * 25)
    : 78 + Math.round(unit(name, 0, 'p95') * 55);
  return { p50, p95: Math.max(p95, p50 + 30) };
}

export function routeLatency(name: string, route: string) {
  const base = projectLatency(name);
  const scale = ROUTE_SCALE[route as (typeof ROUTES)[number]] ?? { p50: 1, p95: 1 };
  const p50 = Math.max(4, Math.round(base.p50 * scale.p50));
  const p95 = Math.max(p50 + 8, Math.round(base.p95 * scale.p95));
  return { p50, p95 };
}

export function histogramFor(count: number, p50: number, p95: number): Hist {
  return histForPercentiles(count, p50, p95);
}

export function latencyOf(count: number, p50: number, p95: number) {
  const hist = histogramFor(count, p50, p95);
  return { p50: percentileMs(hist, 0.5), p95: percentileMs(hist, 0.95), hist };
}

export function windowTotals(
  name: string,
  index: number,
  kind: DemoKind,
  days: number,
  offset: number,
  now = new Date(),
) {
  let pageviews = 0;
  let requests = 0;
  let errors = 0;
  const end = HISTORY_DAYS - 1 - offset;
  for (let day = end - days + 1; day <= end; day += 1) {
    const point = demoPoint(name, index, kind, day, now);
    pageviews += point.pageviews;
    requests += point.requests;
    errors += point.errors;
  }
  const previous = requests === 0 ? pageviews : requests;
  return {
    pageviews,
    requests,
    errors,
    rate: requests === 0 ? 0 : errors / requests,
    volume: previous,
  };
}

export function windowGrowth(
  name: string,
  index: number,
  kind: DemoKind,
  days: number,
  now = new Date(),
) {
  const current = windowTotals(name, index, kind, days, 0, now);
  const previous = windowTotals(name, index, kind, days, days, now);
  if (previous.volume === 0) return null;
  return (current.volume - previous.volume) / previous.volume;
}

export function dayDate(dayIndex: number, now = new Date()) {
  const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 12));
  date.setUTCDate(date.getUTCDate() - (HISTORY_DAYS - 1 - dayIndex));
  return date;
}

function unit(name: string, dayIndex: number, salt: string) {
  return mulberry32(hash(`stellog-demo:${name}:${salt}:${dayIndex}`))();
}

export function demoRand(name: string, dayIndex: number, salt: string) {
  return unit(name, dayIndex, salt);
}

function hash(value: string) {
  let h = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
