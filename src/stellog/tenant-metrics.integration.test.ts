import 'dotenv/config';
import { afterAll, describe, expect, test } from 'vitest';
import { uuid } from '@/lib/crypto';
import prisma from '@/lib/prisma';
import { emptyHist, histForLatency } from './histogram';
import { readTenantMetrics } from './tenant-metrics';

const databaseUrl = process.env.DATABASE_URL;
const start = new Date('2026-11-15T20:00:00.000Z');
const end = new Date('2026-11-15T22:00:00.000Z');

(databaseUrl ? describe : describe.skip)('tenant metric reads', () => {
  const websites: string[] = [];

  afterAll(async () => {
    if (websites.length === 0) return;
    await prisma.client.website.deleteMany({ where: { id: { in: websites } } });
  });

  test('a read for website A does not return website B', async () => {
    const websiteA = await makeWebsite('tenant-view-a');
    const websiteB = await makeWebsite('tenant-view-b');
    websites.push(websiteA, websiteB);

    await prisma.client.apiMetricHour.createMany({
      data: [hour(websiteA, '/accounts/{id}', 200, 6, 12), hour(websiteB, '/secret', 500, 40, 800)],
    });

    const report = await readTenantMetrics(websiteA, start, end, 'hour');

    expect(report.websiteId).toBe(websiteA);
    expect(report.requests).toBe(6);
    expect(report.routes).toEqual([
      expect.objectContaining({ route: '/accounts/{id}', requests: 6, p50: 17.5 }),
    ]);
    expect(report.statuses).toEqual([{ statusCode: 200, requests: 6, share: 1 }]);
    expect(JSON.stringify(report)).not.toContain('/secret');
    expect(JSON.stringify(report)).not.toContain(websiteB);

    const other = await readTenantMetrics(websiteB, start, end, 'hour');
    expect(other.requests).toBe(40);
    expect(other.routes[0].route).toBe('/secret');
    expect(JSON.stringify(other)).not.toContain(websiteA);
  });
});

async function makeWebsite(name: string) {
  const id = uuid();
  await prisma.client.website.create({ data: { id, name } });
  return id;
}

function hour(
  websiteId: string,
  route: string,
  statusCode: number,
  count: number,
  latencyMs: number,
) {
  return {
    websiteId,
    bucketStart: start,
    serviceName: 'api',
    route,
    statusCode,
    requestCount: count,
    latencySumMs: latencyMs * count,
    latencyCount: count,
    ...emptyHist(),
    ...histForLatency(latencyMs, count),
  };
}
