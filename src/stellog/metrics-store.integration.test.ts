import 'dotenv/config';
import { afterAll, describe, expect, test } from 'vitest';
import { uuid } from '@/lib/crypto';
import prisma from '@/lib/prisma';
import { ingestOtlp } from './ingest';
import { createIngestKey, findActiveIngestKey, revokeIngestKey } from './ingest-key';
import {
  insertObservations,
  listRawForWebsite,
  pruneApiMetrics,
  rollupForWebsite,
} from './metrics-store';

const now = new Date('2026-11-15T20:00:00.000Z');
const endNano = String(now.getTime() * 1e6);
const startNano = String(now.getTime() * 1e6 - 12e6);
const databaseUrl = process.env.DATABASE_URL;

(databaseUrl ? describe : describe.skip)('api metric storage', () => {
  const websites: string[] = [];

  afterAll(async () => {
    if (websites.length === 0) return;
    await prisma.client.website.deleteMany({ where: { id: { in: websites } } });
  });

  test('tenant A cannot write or revoke tenant B, and rollups stay scoped', async () => {
    const websiteA = await makeWebsite('metrics-a');
    const websiteB = await makeWebsite('metrics-b');
    websites.push(websiteA, websiteB);

    const keyA = await createIngestKey(websiteA, 'a');
    const keyB = await createIngestKey(websiteB, 'b');

    const accepted = await ingestOtlp(
      {
        authorization: `Bearer ${keyA.token}`,
        signal: 'traces',
        contentType: 'application/json',
        bodyText: traceBody(),
        now,
      },
      { findKey: findActiveIngestKey, insert: insertObservations },
    );
    expect(accepted.status).toBe(200);

    const rejected = await ingestOtlp(
      {
        authorization: `Bearer ${keyA.token}`,
        signal: 'traces',
        contentType: 'application/json',
        bodyText: traceBody(websiteB),
        now,
      },
      { findKey: findActiveIngestKey, insert: insertObservations },
    );
    expect(rejected.status).toBe(403);

    const rowsA = await listRawForWebsite(websiteA);
    const rowsB = await listRawForWebsite(websiteB);
    expect(rowsA.map(row => row.websiteId)).toEqual([websiteA]);
    expect(rowsA[0].route).toBe('/accounts/{id}');
    expect(rowsB).toEqual([]);

    const rollupA = await rollupForWebsite(websiteA);
    const rollupB = await rollupForWebsite(websiteB);
    expect(rollupA.hours).toHaveLength(1);
    expect(rollupA.days).toHaveLength(1);
    expect(rollupA.hours[0].requestCount).toBe(1);
    expect(rollupA.hours[0].h50).toBeGreaterThan(0);
    expect(rollupB.hours).toEqual([]);
    expect(rollupB.days).toEqual([]);

    expect(await revokeIngestKey(websiteB, keyA.id)).toBe(0);
    expect(await findActiveIngestKey(keyA.token)).toMatchObject({
      websites: [{ id: websiteA, name: 'metrics-a' }],
    });
    expect(await revokeIngestKey(websiteA, keyA.id)).toBe(1);
    expect(await findActiveIngestKey(keyA.token)).toBeNull();
    expect((await findActiveIngestKey(keyB.token))?.websites.map(site => site.id)).toEqual([
      websiteB,
    ]);
  });

  test('a cumulative counter is stored as the increase, and fresh rows survive pruning', async () => {
    const websiteId = await makeWebsite('metrics-cumulative');
    websites.push(websiteId);
    const key = await createIngestKey(websiteId, 'cumulative');

    const first = await sendCumulative(key.token, 10);
    const second = await sendCumulative(key.token, 15);
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);

    const rows = await listRawForWebsite(websiteId);
    expect(rows.map(row => row.requestCount)).toEqual([10, 5]);
    const rollup = await rollupForWebsite(websiteId);
    expect(rollup.hours[0].requestCount).toBe(15);
    expect(rollup.days[0].requestCount).toBe(15);

    const pruned = await pruneApiMetrics(now);
    expect(pruned.raw).toBe(0);
    expect(await listRawForWebsite(websiteId)).toHaveLength(2);
  });

  test('hour rows expire after 90 days and day rows stay for 24 months', async () => {
    const websiteId = await makeWebsite('metrics-retention');
    websites.push(websiteId);
    const old = new Date(now.getTime() - 100 * 24 * 60 * 60 * 1000);
    const recent = new Date(now.getTime() - 60 * 60 * 1000);
    await prisma.client.apiMetricHour.create({
      data: { websiteId, bucketStart: old, serviceName: 'api', route: '/old', statusCode: 200 },
    });
    await prisma.client.apiMetricDay.create({
      data: { websiteId, bucketStart: old, serviceName: 'api', route: '/old', statusCode: 200 },
    });
    await prisma.client.apiMetricRaw.create({
      data: {
        id: uuid(),
        websiteId,
        serviceName: 'api',
        route: '/old',
        statusCode: 200,
        requestCount: 1,
        observedAt: new Date(now.getTime() - 49 * 60 * 60 * 1000),
      },
    });
    await prisma.client.apiMetricRaw.create({
      data: {
        id: uuid(),
        websiteId,
        serviceName: 'api',
        route: '/new',
        statusCode: 200,
        requestCount: 1,
        observedAt: recent,
      },
    });

    const pruned = await pruneApiMetrics(now);
    expect(pruned.hours).toBe(1);
    expect(pruned.days).toBe(0);
    expect(pruned.raw).toBe(1);
    expect(await rollupForWebsite(websiteId)).toMatchObject({
      hours: [],
      days: [{ route: '/old' }],
    });
  });

  test('routes past the team cap are stored as other', async () => {
    const previous = process.env.STELLOG_ROUTE_CAP;
    process.env.STELLOG_ROUTE_CAP = '2';
    try {
      const websiteId = await makeWebsite('metrics-cap');
      websites.push(websiteId);
      const key = await createIngestKey(websiteId, 'cap');
      if (!key) throw new Error('key');
      for (const route of ['/one', '/two', '/three']) {
        const result = await ingestOtlp(
          {
            authorization: `Bearer ${key.token}`,
            signal: 'traces',
            contentType: 'application/json',
            bodyText: traceBody(undefined, 'metrics-cap').replace('/accounts/99', route),
            now,
          },
          { findKey: findActiveIngestKey, insert: insertObservations },
        );
        expect(result.status).toBe(200);
      }
      const rows = await listRawForWebsite(websiteId);
      expect(rows.map(row => row.route).sort()).toEqual(['/one', '/two', 'other']);
    } finally {
      if (previous === undefined) delete process.env.STELLOG_ROUTE_CAP;
      else process.env.STELLOG_ROUTE_CAP = previous;
    }
  });
});

async function makeWebsite(name: string) {
  const id = uuid();
  await prisma.client.website.create({ data: { id, name } });
  return id;
}

function traceBody(tenantId?: string, serviceName = 'metrics-a') {
  return JSON.stringify({
    resourceSpans: [
      {
        resource: {
          attributes: [
            { key: 'service.name', value: { stringValue: serviceName } },
            ...(tenantId ? [{ key: 'tenant.id', value: { stringValue: tenantId } }] : []),
          ],
        },
        scopeSpans: [
          {
            spans: [
              {
                startTimeUnixNano: startNano,
                endTimeUnixNano: endNano,
                attributes: [
                  { key: 'url.path', value: { stringValue: '/accounts/99' } },
                  { key: 'http.response.status_code', value: { intValue: 200 } },
                ],
              },
            ],
          },
        ],
      },
    ],
  });
}

function sendCumulative(token: string, count: number) {
  return ingestOtlp(
    {
      authorization: `Bearer ${token}`,
      signal: 'metrics',
      contentType: 'application/json',
      bodyText: JSON.stringify({
        resourceMetrics: [
          {
            resource: {
              attributes: [{ key: 'service.name', value: { stringValue: 'metrics-cumulative' } }],
            },
            scopeMetrics: [
              {
                metrics: [
                  {
                    name: 'http.server.requests',
                    sum: {
                      aggregationTemporality: 2,
                      dataPoints: [
                        {
                          attributes: [
                            { key: 'http.route', value: { stringValue: '/health' } },
                            { key: 'http.response.status_code', value: { intValue: 200 } },
                          ],
                          timeUnixNano: endNano,
                          asInt: String(count),
                        },
                      ],
                    },
                  },
                ],
              },
            ],
          },
        ],
      }),
      now,
    },
    { findKey: findActiveIngestKey, insert: insertObservations },
  );
}
