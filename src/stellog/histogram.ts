/** Cumulative millisecond buckets. A value of 40ms increments h50 and every wider bucket. */
export const HISTOGRAM_BOUNDS_MS = [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000] as const;

export type HistKey =
  | 'h5'
  | 'h10'
  | 'h25'
  | 'h50'
  | 'h100'
  | 'h250'
  | 'h500'
  | 'h1000'
  | 'h2500'
  | 'h5000'
  | 'h10000'
  | 'hInf';

export type Hist = Record<HistKey, number>;

const BOUND_KEYS: Array<[HistKey, number]> = [
  ['h5', 5],
  ['h10', 10],
  ['h25', 25],
  ['h50', 50],
  ['h100', 100],
  ['h250', 250],
  ['h500', 500],
  ['h1000', 1000],
  ['h2500', 2500],
  ['h5000', 5000],
  ['h10000', 10000],
];

export function emptyHist(): Hist {
  return {
    h5: 0,
    h10: 0,
    h25: 0,
    h50: 0,
    h100: 0,
    h250: 0,
    h500: 0,
    h1000: 0,
    h2500: 0,
    h5000: 0,
    h10000: 0,
    hInf: 0,
  };
}

export function addHist(left: Hist, right: Hist): Hist {
  const next = emptyHist();
  for (const key of Object.keys(next) as HistKey[]) {
    next[key] = left[key] + right[key];
  }
  return next;
}

export function subtractHist(next: Hist, previous: Hist): Hist {
  const delta = emptyHist();
  for (const key of Object.keys(delta) as HistKey[]) {
    delta[key] = Math.max(0, next[key] - previous[key]);
  }
  return delta;
}

/** One measured latency, repeated `count` times. The result is a cumulative histogram. */
export function histForLatency(latencyMs: number, count: number): Hist {
  const hist = emptyHist();
  if (count <= 0 || !Number.isFinite(latencyMs) || latencyMs < 0) return hist;
  hist.hInf = count;
  for (const [key, bound] of BOUND_KEYS) {
    if (latencyMs <= bound) hist[key] = count;
  }
  return hist;
}

/**
 * Rebucket an OTLP explicit histogram into the fixed cumulative bounds.
 * A source bucket is included in a bound only when its upper edge is at or below that bound.
 * The +Inf source bucket is included only in hInf. This under-counts a bound when a source
 * bucket straddles it, which is preferable to inventing latencies inside the bucket.
 */
export function histFromExplicitBuckets(explicitBounds: number[], bucketCounts: number[]): Hist {
  const hist = emptyHist();
  if (explicitBounds.length === 0 && bucketCounts.length === 0) return hist;

  const finite = explicitBounds.length;
  let running = 0;
  const cumulativeAt: number[] = [];
  for (let i = 0; i < finite; i++) {
    running += nonNegative(bucketCounts[i] ?? 0);
    cumulativeAt.push(running);
  }
  const infCount = nonNegative(bucketCounts[finite] ?? 0);
  hist.hInf = running + infCount;

  for (const [key, bound] of BOUND_KEYS) {
    let value = 0;
    for (let i = 0; i < finite; i++) {
      if (explicitBounds[i] <= bound) value = cumulativeAt[i];
    }
    hist[key] = value;
  }
  return hist;
}

/**
 * Linear interpolation inside the cumulative bucket that holds the percentile.
 * Returns null when the histogram is empty, and Infinity when the percentile sits above 10s.
 */
export function percentileMs(hist: Hist, percentile: number): number | null {
  if (hist.hInf <= 0 || percentile <= 0 || percentile > 1) return null;
  const target = hist.hInf * percentile;
  let previousBound = 0;
  let previousCount = 0;
  for (const [key, bound] of BOUND_KEYS) {
    const count = hist[key];
    if (count >= target) {
      const span = count - previousCount;
      if (span <= 0) return bound;
      const fraction = (target - previousCount) / span;
      return previousBound + fraction * (bound - previousBound);
    }
    previousBound = bound;
    previousCount = count;
  }
  return Number.POSITIVE_INFINITY;
}

/** Cumulative histogram whose interpolated p50 and p95 land on the requested latencies. */
export function histForPercentiles(count: number, p50: number, p95: number): Hist {
  const hist = emptyHist();
  if (count <= 0) return hist;
  const median = Math.max(1, p50);
  const tail = Math.max(median * 1.05, p95);
  const sigma = Math.log(tail / median) / 1.64485362695;
  const cdf = (ms: number) => normalCdf(Math.log(ms / median) / sigma);
  let assigned = 0;
  for (const [key, bound] of BOUND_KEYS) {
    const value = Math.min(count, Math.max(assigned, Math.round(count * cdf(bound))));
    hist[key] = value;
    assigned = value;
  }
  hist.hInf = count;
  return hist;
}

function normalCdf(z: number) {
  const sign = z < 0 ? -1 : 1;
  const x = Math.abs(z) / Math.SQRT2;
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const t = 1 / (1 + p * x);
  const erf = 1 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  return 0.5 * (1 + sign * erf);
}

function nonNegative(value: number): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  return value;
}

export function unitToMilliseconds(unit: string | null | undefined): number {
  switch (unit?.trim().toLowerCase()) {
    case 's':
    case 'sec':
    case 'seconds':
      return 1000;
    case 'ms':
    case 'milliseconds':
      return 1;
    case 'us':
    case 'microseconds':
      return 0.001;
    case 'ns':
    case 'nanoseconds':
      return 1e-6;
    default:
      return 1;
  }
}
