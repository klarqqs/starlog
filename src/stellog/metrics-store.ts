import type { Prisma } from '@/generated/prisma/client';
import { uuid } from '@/lib/crypto';
import prisma from '@/lib/prisma';
import type { CumulativePoint } from './cumulative';
import { emptyHist, type Hist } from './histogram';
import { deltaOf, type Observation } from './otlp';
import { aggregateCutoff, hourCutoff, rawCutoff, startOfUtcDay, startOfUtcHour } from './retention';
import { groupObservations, type RollupGroup } from './rollup';
import { assignRouteCap, routeCapLimit } from './route-cap';

type Tx = Prisma.TransactionClient;

export async function insertObservations(websiteId: string, rows: Observation[]): Promise<void> {
  if (rows.length === 0) return;

  await prisma.transaction(async (tx: Tx) => {
    const ready: Observation[] = [];
    for (const row of rows) {
      const next = await materialize(tx, websiteId, row);
      if (next && Math.round(next.count) > 0) ready.push(next);
    }
    if (ready.length === 0) return;

    const website = await tx.website.findUnique({
      where: { id: websiteId },
      select: { teamId: true },
    });
    const cap = routeCapLimit();
    const knownByHour = new Map<string, Set<string>>();
    for (const row of ready) {
      const bucket = startOfUtcHour(row.observedAt);
      const key = bucket.toISOString();
      let known = knownByHour.get(key);
      if (!known) {
        known = await knownRoutes(tx, websiteId, website?.teamId ?? null, bucket);
        knownByHour.set(key, known);
      }
      row.route = assignRouteCap(known, row.route, cap);
    }

    await tx.apiMetricRaw.createMany({
      data: ready.map(row => ({
        id: uuid(),
        websiteId,
        serviceName: row.serviceName,
        route: row.route,
        statusCode: row.statusCode,
        latencyMs: row.latencyMs,
        requestCount: Math.round(row.count),
        latencySumMs: row.latencySumMs,
        observedAt: row.observedAt,
      })),
    });

    for (const group of groupObservations(websiteId, ready, startOfUtcHour)) {
      await upsertRollup(tx, 'api_metric_hour', group);
    }
    for (const group of groupObservations(websiteId, ready, startOfUtcDay)) {
      await upsertRollup(tx, 'api_metric_day', group);
    }
  });
}

async function materialize(
  tx: Tx,
  websiteId: string,
  row: Observation,
): Promise<Observation | null> {
  if (row.temporality !== 'cumulative' || !row.cursor) return row;

  const lockKey = [
    websiteId,
    row.serviceName,
    row.route,
    String(row.statusCode),
    row.metricName,
  ].join('|');
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;

  const previous = await tx.apiMetricCursor.findUnique({
    where: {
      websiteId_serviceName_route_statusCode_metricName: {
        websiteId,
        serviceName: row.serviceName,
        route: row.route,
        statusCode: row.statusCode,
        metricName: row.metricName,
      },
    },
  });

  const prior: CumulativePoint | null = previous
    ? { count: previous.lastCount, sum: previous.lastSum, hist: histFromJson(previous.lastHist) }
    : null;
  const next = deltaOf(row, prior);

  await tx.apiMetricCursor.upsert({
    where: {
      websiteId_serviceName_route_statusCode_metricName: {
        websiteId,
        serviceName: row.serviceName,
        route: row.route,
        statusCode: row.statusCode,
        metricName: row.metricName,
      },
    },
    create: {
      websiteId,
      serviceName: row.serviceName,
      route: row.route,
      statusCode: row.statusCode,
      metricName: row.metricName,
      lastCount: Math.round(row.cursor.count),
      lastSum: row.cursor.sum,
      lastHist: row.cursor.hist,
      updatedAt: row.observedAt,
    },
    update: {
      lastCount: Math.round(row.cursor.count),
      lastSum: row.cursor.sum,
      lastHist: row.cursor.hist,
      updatedAt: row.observedAt,
    },
  });

  return next;
}

function histFromJson(value: unknown): Hist {
  const hist = emptyHist();
  if (!value || typeof value !== 'object') return hist;
  for (const key of Object.keys(hist) as Array<keyof Hist>) {
    const read = (value as Record<string, unknown>)[key];
    if (typeof read === 'number' && Number.isFinite(read)) hist[key] = read;
  }
  return hist;
}

function roundHist(hist: Hist): Hist {
  const next = emptyHist();
  for (const key of Object.keys(next) as Array<keyof Hist>) {
    next[key] = Math.round(hist[key]);
  }
  return next;
}

async function upsertRollup(
  tx: Tx,
  table: 'api_metric_hour' | 'api_metric_day',
  group: RollupGroup,
) {
  const count = Math.round(group.requestCount);
  const latencyCount = Math.round(group.latencyCount);
  const hist = roundHist(group.hist);
  if (table === 'api_metric_hour') {
    await tx.$executeRaw`
      INSERT INTO api_metric_hour (
        website_id, bucket_start, service_name, route, status_code,
        request_count, latency_sum_ms, latency_count,
        h5, h10, h25, h50, h100, h250, h500, h1000, h2500, h5000, h10000, h_inf
      ) VALUES (
        ${group.websiteId}::uuid, ${group.bucketStart}, ${group.serviceName}, ${group.route}, ${group.statusCode},
        ${count}, ${group.latencySumMs}, ${latencyCount},
        ${hist.h5}, ${hist.h10}, ${hist.h25}, ${hist.h50}, ${hist.h100}, ${hist.h250},
        ${hist.h500}, ${hist.h1000}, ${hist.h2500}, ${hist.h5000}, ${hist.h10000}, ${hist.hInf}
      )
      ON CONFLICT (website_id, bucket_start, service_name, route, status_code)
      DO UPDATE SET
        request_count = api_metric_hour.request_count + EXCLUDED.request_count,
        latency_sum_ms = api_metric_hour.latency_sum_ms + EXCLUDED.latency_sum_ms,
        latency_count = api_metric_hour.latency_count + EXCLUDED.latency_count,
        h5 = api_metric_hour.h5 + EXCLUDED.h5,
        h10 = api_metric_hour.h10 + EXCLUDED.h10,
        h25 = api_metric_hour.h25 + EXCLUDED.h25,
        h50 = api_metric_hour.h50 + EXCLUDED.h50,
        h100 = api_metric_hour.h100 + EXCLUDED.h100,
        h250 = api_metric_hour.h250 + EXCLUDED.h250,
        h500 = api_metric_hour.h500 + EXCLUDED.h500,
        h1000 = api_metric_hour.h1000 + EXCLUDED.h1000,
        h2500 = api_metric_hour.h2500 + EXCLUDED.h2500,
        h5000 = api_metric_hour.h5000 + EXCLUDED.h5000,
        h10000 = api_metric_hour.h10000 + EXCLUDED.h10000,
        h_inf = api_metric_hour.h_inf + EXCLUDED.h_inf
    `;
    return;
  }

  await tx.$executeRaw`
    INSERT INTO api_metric_day (
      website_id, bucket_start, service_name, route, status_code,
      request_count, latency_sum_ms, latency_count,
      h5, h10, h25, h50, h100, h250, h500, h1000, h2500, h5000, h10000, h_inf
    ) VALUES (
      ${group.websiteId}::uuid, ${group.bucketStart}, ${group.serviceName}, ${group.route}, ${group.statusCode},
      ${count}, ${group.latencySumMs}, ${latencyCount},
      ${hist.h5}, ${hist.h10}, ${hist.h25}, ${hist.h50}, ${hist.h100}, ${hist.h250},
      ${hist.h500}, ${hist.h1000}, ${hist.h2500}, ${hist.h5000}, ${hist.h10000}, ${hist.hInf}
    )
    ON CONFLICT (website_id, bucket_start, service_name, route, status_code)
    DO UPDATE SET
      request_count = api_metric_day.request_count + EXCLUDED.request_count,
      latency_sum_ms = api_metric_day.latency_sum_ms + EXCLUDED.latency_sum_ms,
      latency_count = api_metric_day.latency_count + EXCLUDED.latency_count,
      h5 = api_metric_day.h5 + EXCLUDED.h5,
      h10 = api_metric_day.h10 + EXCLUDED.h10,
      h25 = api_metric_day.h25 + EXCLUDED.h25,
      h50 = api_metric_day.h50 + EXCLUDED.h50,
      h100 = api_metric_day.h100 + EXCLUDED.h100,
      h250 = api_metric_day.h250 + EXCLUDED.h250,
      h500 = api_metric_day.h500 + EXCLUDED.h500,
      h1000 = api_metric_day.h1000 + EXCLUDED.h1000,
      h2500 = api_metric_day.h2500 + EXCLUDED.h2500,
      h5000 = api_metric_day.h5000 + EXCLUDED.h5000,
      h10000 = api_metric_day.h10000 + EXCLUDED.h10000,
      h_inf = api_metric_day.h_inf + EXCLUDED.h_inf
  `;
}

async function knownRoutes(tx: Tx, websiteId: string, teamId: string | null, bucket: Date) {
  const websites = teamId
    ? await tx.website.findMany({ where: { teamId }, select: { id: true } })
    : [{ id: websiteId }];
  const rows = await tx.apiMetricHour.findMany({
    where: {
      websiteId: { in: websites.map(website => website.id) },
      bucketStart: bucket,
      route: { not: 'other' },
    },
    select: { route: true },
    distinct: ['route'],
  });
  return new Set(rows.map(row => row.route));
}

export async function listRawForWebsite(websiteId: string) {
  return prisma.client.apiMetricRaw.findMany({
    where: { websiteId },
    select: {
      websiteId: true,
      route: true,
      statusCode: true,
      requestCount: true,
      serviceName: true,
    },
    orderBy: { observedAt: 'asc' },
  });
}

export async function rollupForWebsite(websiteId: string) {
  const [hours, days] = await Promise.all([
    prisma.client.apiMetricHour.findMany({ where: { websiteId } }),
    prisma.client.apiMetricDay.findMany({ where: { websiteId } }),
  ]);
  return { hours, days };
}

export async function pruneApiMetrics(now = new Date()) {
  const rawBefore = rawCutoff(now);
  const hourBefore = hourCutoff(now);
  const dayBefore = aggregateCutoff(now);
  const [raw, hours, days] = await Promise.all([
    prisma.client.apiMetricRaw.deleteMany({ where: { observedAt: { lt: rawBefore } } }),
    prisma.client.apiMetricHour.deleteMany({ where: { bucketStart: { lt: hourBefore } } }),
    prisma.client.apiMetricDay.deleteMany({ where: { bucketStart: { lt: dayBefore } } }),
  ]);
  return { raw: raw.count, hours: hours.count, days: days.count };
}
