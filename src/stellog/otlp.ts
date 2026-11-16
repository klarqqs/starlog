import { type CumulativePoint, cumulativeDelta } from './cumulative';
import {
  emptyHist,
  type Hist,
  histForLatency,
  histFromExplicitBuckets,
  unitToMilliseconds,
} from './histogram';
import { resolveHttpRoute } from './normalize-route';
import { acceptedObservationTime } from './retention';

export type Temporality = 'delta' | 'cumulative';

/** A metric derived from an OTLP data point or a span. Span and trace bodies are not retained. */
export type Observation = {
  serviceName: string;
  route: string;
  statusCode: number;
  count: number;
  latencySumMs: number;
  /** Set for a single span. Null for a pre-aggregated histogram or counter. */
  latencyMs: number | null;
  hasLatency: boolean;
  hist: Hist;
  observedAt: Date;
  temporality: Temporality;
  /** Empty for spans. Set for OTLP metrics so cumulative exports can be differenced. */
  metricName: string;
  cursor: CumulativePoint | null;
};

export type Extracted = {
  observations: Observation[];
  tenantIds: string[];
  skipped: number;
};

const MAX_SERVICE = 255;
const MAX_METRIC = 255;

type Attrs = Map<string, string | number>;

export function extractSignal(
  signal: 'metrics' | 'traces' | 'logs',
  body: unknown,
  now: Date,
): Extracted | { error: string } {
  if (!isRecord(body)) return { error: 'JSON object required.' };

  if (signal === 'logs') {
    if (!Array.isArray(body.resourceLogs)) return { error: 'resourceLogs required.' };
    return { observations: [], tenantIds: [], skipped: 0 };
  }

  if (signal === 'traces') {
    const groups = arrayOf(body.resourceSpans);
    if (!groups) return { error: 'resourceSpans required.' };
    return walkGroups(groups, 'spans', now, spanObservations);
  }

  const groups = arrayOf(body.resourceMetrics);
  if (!groups) return { error: 'resourceMetrics required.' };
  return walkGroups(groups, 'metrics', now, metricObservations);
}

function walkGroups(
  groups: unknown[],
  kind: 'spans' | 'metrics',
  now: Date,
  read: (
    resource: Attrs,
    items: unknown[],
    now: Date,
  ) => { observations: Observation[]; skipped: number },
): Extracted {
  const observations: Observation[] = [];
  const tenantIds: string[] = [];
  let skipped = 0;

  for (const group of groups) {
    if (!isRecord(group)) {
      skipped += 1;
      continue;
    }
    const resource = attributesOf(isRecord(group.resource) ? group.resource.attributes : undefined);
    const tenant = resource.get('tenant.id');
    if (tenant !== undefined) tenantIds.push(String(tenant).toLowerCase());

    const scopes = scopeList(group, kind);
    for (const scope of scopes) {
      const items =
        kind === 'spans'
          ? arrayOf(scopeField(scope, 'spans'))
          : arrayOf(scopeField(scope, 'metrics'));
      if (!items) continue;
      const found = read(resource, items, now);
      observations.push(...found.observations);
      skipped += found.skipped;
    }
  }

  return { observations, tenantIds, skipped };
}

function spanObservations(
  resource: Attrs,
  spans: unknown[],
  now: Date,
): { observations: Observation[]; skipped: number } {
  const observations: Observation[] = [];
  let skipped = 0;
  const serviceName = clip(stringAttr(resource, 'service.name') ?? '', MAX_SERVICE);

  for (const span of spans) {
    if (!isRecord(span)) {
      skipped += 1;
      continue;
    }
    const attrs = attributesOf(span.attributes);
    const route = routeOf(attrs);
    const statusCode = statusOf(
      attrs.get('http.response.status_code') ?? attrs.get('http.status_code'),
    );
    const start = nano(span.startTimeUnixNano);
    const end = nano(span.endTimeUnixNano);
    if (!route || statusCode === null || start === null || end === null || end < start) {
      skipped += 1;
      continue;
    }
    const observedAt = new Date(end / 1e6);
    if (!acceptedObservationTime(observedAt, now)) {
      skipped += 1;
      continue;
    }
    const latencyMs = (end - start) / 1e6;
    observations.push({
      serviceName,
      route,
      statusCode,
      count: 1,
      latencySumMs: latencyMs,
      latencyMs,
      hasLatency: true,
      hist: histForLatency(latencyMs, 1),
      observedAt,
      temporality: 'delta',
      metricName: '',
      cursor: null,
    });
  }

  return { observations, skipped };
}

function metricObservations(
  resource: Attrs,
  metrics: unknown[],
  now: Date,
): { observations: Observation[]; skipped: number } {
  const observations: Observation[] = [];
  let skipped = 0;
  const serviceName = clip(stringAttr(resource, 'service.name') ?? '', MAX_SERVICE);

  for (const metric of metrics) {
    if (!isRecord(metric)) {
      skipped += 1;
      continue;
    }
    const name = clip(typeof metric.name === 'string' ? metric.name : '', MAX_METRIC);
    const factor = unitToMilliseconds(typeof metric.unit === 'string' ? metric.unit : '');
    const histogram = isRecord(metric.histogram)
      ? metric.histogram
      : isRecord(metric.exponentialHistogram)
        ? metric.exponentialHistogram
        : null;
    const sum = isRecord(metric.sum) ? metric.sum : null;

    if (histogram) {
      const temporality = temporalityOf(histogram.aggregationTemporality);
      for (const point of arrayOf(histogram.dataPoints) ?? []) {
        const observation = histogramPoint(
          point,
          serviceName,
          name,
          factor,
          temporality,
          now,
          !metric.exponentialHistogram,
        );
        if (!observation) skipped += 1;
        else observations.push(observation);
      }
      continue;
    }

    if (sum) {
      const temporality = temporalityOf(sum.aggregationTemporality);
      for (const point of arrayOf(sum.dataPoints) ?? []) {
        const observation = counterPoint(point, serviceName, name, temporality, now);
        if (!observation) skipped += 1;
        else observations.push(observation);
      }
      continue;
    }

    skipped += 1;
  }

  return { observations, skipped };
}

function histogramPoint(
  point: unknown,
  serviceName: string,
  metricName: string,
  factor: number,
  temporality: Temporality,
  now: Date,
  explicit: boolean,
): Observation | null {
  if (!isRecord(point)) return null;
  const attrs = attributesOf(point.attributes);
  const route = routeOf(attrs);
  const statusCode = statusOf(
    attrs.get('http.response.status_code') ?? attrs.get('http.status_code'),
  );
  const observedAt = timeOf(point.timeUnixNano, now);
  const count = finite(point.count);
  if (!route || statusCode === null || !observedAt || count === null || count < 0) return null;

  const sum = finite(point.sum);
  const latencySumMs = sum === null ? 0 : sum * factor;
  let hist = emptyHist();
  hist.hInf = count;
  if (explicit) {
    const bounds = (arrayOf(point.explicitBounds) ?? [])
      .map(item => finite(item))
      .filter((item): item is number => item !== null);
    const counts = (arrayOf(point.bucketCounts) ?? [])
      .map(item => finite(item))
      .filter((item): item is number => item !== null);
    if (bounds.length > 0) {
      hist = histFromExplicitBuckets(
        bounds.map(bound => bound * factor),
        counts,
      );
      if (hist.hInf === 0) hist.hInf = count;
    }
  }

  return {
    serviceName,
    route,
    statusCode,
    count,
    latencySumMs,
    latencyMs: null,
    hasLatency: true,
    hist,
    observedAt,
    temporality,
    metricName,
    cursor: { count, sum: latencySumMs, hist },
  };
}

function counterPoint(
  point: unknown,
  serviceName: string,
  metricName: string,
  temporality: Temporality,
  now: Date,
): Observation | null {
  if (!isRecord(point)) return null;
  const attrs = attributesOf(point.attributes);
  const route = routeOf(attrs);
  const statusCode = statusOf(
    attrs.get('http.response.status_code') ?? attrs.get('http.status_code'),
  );
  const observedAt = timeOf(point.timeUnixNano, now);
  const count = finite(point.asInt ?? point.asDouble);
  if (!route || statusCode === null || !observedAt || count === null || count < 0) return null;
  const hist = emptyHist();
  return {
    serviceName,
    route,
    statusCode,
    count,
    latencySumMs: 0,
    latencyMs: null,
    hasLatency: false,
    hist,
    observedAt,
    temporality,
    metricName,
    cursor: { count, sum: 0, hist },
  };
}

export function deltaOf(
  observation: Observation,
  previous: CumulativePoint | null,
): Observation | null {
  if (observation.temporality !== 'cumulative' || !observation.cursor) return observation;
  const delta = cumulativeDelta(previous, observation.cursor);
  if (delta.count === 0 && delta.sum === 0) return null;
  return {
    ...observation,
    count: delta.count,
    latencySumMs: delta.sum,
    latencyMs: null,
    hist: delta.hist,
  };
}

function routeOf(attrs: Attrs): string | null {
  const route = stringAttr(attrs, 'http.route');
  const path =
    stringAttr(attrs, 'url.path') ??
    stringAttr(attrs, 'http.target') ??
    stringAttr(attrs, 'url.full') ??
    stringAttr(attrs, 'http.url');
  if (!route && !path) return null;
  return resolveHttpRoute({ route, path });
}

function temporalityOf(value: unknown): Temporality {
  const numeric = typeof value === 'string' ? Number(value) : typeof value === 'number' ? value : 0;
  return numeric === 2 ? 'cumulative' : 'delta';
}

function timeOf(value: unknown, now: Date): Date | null {
  const parsed = nano(value);
  const observedAt = parsed === null ? now : new Date(parsed / 1e6);
  if (Number.isNaN(observedAt.getTime())) return null;
  if (!acceptedObservationTime(observedAt, now)) return null;
  return observedAt;
}

function statusOf(value: string | number | undefined): number | null {
  if (value === undefined) return null;
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(numeric) || numeric < 100 || numeric > 599) return null;
  return numeric;
}

function stringAttr(attrs: Attrs, key: string): string | null {
  const value = attrs.get(key);
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function attributesOf(value: unknown): Attrs {
  const map: Attrs = new Map();
  if (!Array.isArray(value)) return map;
  for (const item of value) {
    if (!isRecord(item) || typeof item.key !== 'string') continue;
    const read = attributeValue(item.value);
    if (read !== undefined) map.set(item.key, read);
  }
  return map;
}

function attributeValue(value: unknown): string | number | undefined {
  if (!isRecord(value)) return undefined;
  if (typeof value.stringValue === 'string') return value.stringValue;
  if (value.intValue !== undefined && value.intValue !== null) {
    const numeric = finite(value.intValue);
    return numeric === null ? undefined : numeric;
  }
  if (value.doubleValue !== undefined && value.doubleValue !== null) {
    const numeric = finite(value.doubleValue);
    return numeric === null ? undefined : numeric;
  }
  return undefined;
}

function scopeList(group: Record<string, unknown>, kind: 'spans' | 'metrics'): unknown[] {
  const modern = kind === 'spans' ? group.scopeSpans : group.scopeMetrics;
  const legacy =
    kind === 'spans' ? group.instrumentationLibrarySpans : group.instrumentationLibraryMetrics;
  return arrayOf(modern) ?? arrayOf(legacy) ?? [];
}

function scopeField(scope: unknown, key: 'spans' | 'metrics'): unknown {
  return isRecord(scope) ? scope[key] : undefined;
}

function nano(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
  }
  return null;
}

function finite(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
  }
  return null;
}

function arrayOf(value: unknown): unknown[] | null {
  return Array.isArray(value) ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function clip(value: string, max: number): string {
  return value.length <= max ? value : value.slice(0, max);
}
