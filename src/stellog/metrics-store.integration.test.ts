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
    expect(await findActiveIngestKey(keyA.token)).toEqual({ websiteId: websiteA });
    expect(await revokeIngestKey(websiteA, keyA.id)).toBe(1);
    expect(await findActiveIngestKey(keyA.token)).toBeNull();
    expect(await findActiveIngestKey(keyB.token)).toEqual({ websiteId: websiteB });
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
});

async function makeWebsite(name: string) {
  const id = uuid();
  await prisma.client.website.create({ data: { id, name } });
  return id;
}

function traceBody(tenantId?: string) {
  return JSON.stringify({
    resourceSpans: [
      {
        resource: {
          attributes: tenantId ? [{ key: 'tenant.id', value: { stringValue: tenantId } }] : [],
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
