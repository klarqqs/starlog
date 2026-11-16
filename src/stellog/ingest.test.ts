import { describe, expect, test } from 'vitest';
import { type IngestKeyScope, ingestOtlp } from './ingest';
import type { Observation } from './otlp';

const now = new Date('2026-11-15T20:00:00.000Z');
const endNano = String(now.getTime() * 1e6);
const startNano = String(now.getTime() * 1e6 - 5e6);
const websiteA = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const websiteB = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

function team(websites: Array<{ id: string; name: string }>): IngestKeyScope {
  return { teamId: '11111111-1111-1111-1111-111111111111', websites };
}

function deps(keys: Record<string, IngestKeyScope>) {
  const inserted: Array<{ websiteId: string; rows: Observation[] }> = [];
  return {
    inserted,
    findKey: async (token: string) => keys[token] ?? null,
    insert: async (websiteId: string, rows: Observation[]) => {
      inserted.push({ websiteId, rows });
    },
  };
}

function traceBody(tenantId?: string) {
  return JSON.stringify({
    resourceSpans: [
      {
        resource: {
          attributes: [
            { key: 'service.name', value: { stringValue: 'api' } },
            ...(tenantId ? [{ key: 'tenant.id', value: { stringValue: tenantId } }] : []),
          ],
        },
        scopeSpans: [
          {
            spans: [
              {
                traceId: 'hidden-trace',
                spanId: 'hidden-span',
                startTimeUnixNano: startNano,
                endTimeUnixNano: endNano,
                attributes: [
                  { key: 'http.route', value: { stringValue: '/accounts/123' } },
                  { key: 'http.response.status_code', value: { intValue: 200 } },
                  { key: 'user.email', value: { stringValue: 'person@example.com' } },
                ],
              },
            ],
          },
        ],
      },
    ],
  });
}

describe('ingestOtlp', () => {
  test('service.name selects the website inside the team', async () => {
    const store = deps({ stk_a: team([{ id: websiteA, name: 'api' }]) });
    const result = await ingestOtlp(
      {
        authorization: 'Bearer stk_a',
        signal: 'traces',
        contentType: 'application/json',
        bodyText: traceBody(),
        now,
      },
      store,
    );

    expect(result.status).toBe(200);
    expect(store.inserted).toHaveLength(1);
    expect(store.inserted[0].websiteId).toBe(websiteA);
    expect(store.inserted[0].rows[0].route).toBe('/accounts/{id}');
    expect(JSON.stringify(store.inserted)).not.toContain(websiteB);
    expect(JSON.stringify(store.inserted)).not.toContain('person@example.com');
    expect(JSON.stringify(store.inserted)).not.toContain('hidden-trace');
  });

  test('rejects a payload that names another tenant and stores nothing', async () => {
    const store = deps({ stk_a: team([{ id: websiteA, name: 'api' }]) });
    const result = await ingestOtlp(
      {
        authorization: 'Bearer stk_a',
        signal: 'traces',
        contentType: 'application/json',
        bodyText: traceBody(websiteB),
        now,
      },
      store,
    );

    expect(result.status).toBe(403);
    expect(store.inserted).toHaveLength(0);
  });

  test('accepts the matching tenant id in any case', async () => {
    const store = deps({ stk_a: team([{ id: websiteA, name: 'api' }]) });
    const result = await ingestOtlp(
      {
        authorization: 'Bearer stk_a',
        signal: 'traces',
        contentType: 'application/json',
        bodyText: traceBody(websiteA.toUpperCase()),
        now,
      },
      store,
    );
    expect(result.status).toBe(200);
    expect(store.inserted[0].websiteId).toBe(websiteA);
  });

  test('a key for tenant B cannot write tenant A', async () => {
    const store = deps({ stk_b: team([{ id: websiteB, name: 'api' }]) });
    const result = await ingestOtlp(
      {
        authorization: 'Bearer stk_b',
        signal: 'traces',
        contentType: 'application/json',
        bodyText: traceBody(websiteA),
        now,
      },
      store,
    );
    expect(result.status).toBe(403);
    expect(store.inserted).toHaveLength(0);
  });

  test('missing and unknown keys are rejected', async () => {
    const store = deps({ stk_a: team([{ id: websiteA, name: 'api' }]) });
    expect(
      (
        await ingestOtlp(
          {
            authorization: null,
            signal: 'traces',
            contentType: 'application/json',
            bodyText: traceBody(),
            now,
          },
          store,
        )
      ).status,
    ).toBe(401);
    expect(
      (
        await ingestOtlp(
          {
            authorization: 'Bearer stk_nope',
            signal: 'traces',
            contentType: 'application/json',
            bodyText: traceBody(),
            now,
          },
          store,
        )
      ).status,
    ).toBe(401);
    expect(store.inserted).toHaveLength(0);
  });

  test('drops logs without calling insert', async () => {
    const store = deps({ stk_a: team([{ id: websiteA, name: 'api' }]) });
    const result = await ingestOtlp(
      {
        authorization: 'Bearer stk_a',
        signal: 'logs',
        contentType: 'application/json',
        bodyText: JSON.stringify({
          resourceLogs: [
            { scopeLogs: [{ logRecords: [{ body: { stringValue: 'secret-log-line' } }] }] },
          ],
        }),
        now,
      },
      store,
    );
    expect(result.status).toBe(200);
    expect(result.body).toEqual({});
    expect(JSON.stringify(result.body)).not.toContain('secret-log-line');
    expect(store.inserted).toHaveLength(0);
  });

  test('a sibling website on the same team is accepted by tenant.id', async () => {
    const store = deps({
      stk_a: team([
        { id: websiteA, name: 'api' },
        { id: websiteB, name: 'other' },
      ]),
    });
    const result = await ingestOtlp(
      {
        authorization: 'Bearer stk_a',
        signal: 'traces',
        contentType: 'application/json',
        bodyText: traceBody(websiteB),
        now,
      },
      store,
    );
    expect(result.status).toBe(200);
    expect(store.inserted.map(row => row.websiteId)).toEqual([websiteB]);
  });

  test('an unknown service name stores nothing', async () => {
    const store = deps({ stk_a: team([{ id: websiteA, name: 'billing' }]) });
    const result = await ingestOtlp(
      {
        authorization: 'Bearer stk_a',
        signal: 'traces',
        contentType: 'application/json',
        bodyText: traceBody(),
        now,
      },
      store,
    );
    expect(result.status).toBe(403);
    expect(store.inserted).toHaveLength(0);
  });

  test('refuses protobuf', async () => {
    const store = deps({ stk_a: team([{ id: websiteA, name: 'api' }]) });
    const result = await ingestOtlp(
      {
        authorization: 'Bearer stk_a',
        signal: 'traces',
        contentType: 'application/x-protobuf',
        bodyText: '{}',
        now,
      },
      store,
    );
    expect(result.status).toBe(415);
    expect(store.inserted).toHaveLength(0);
  });
});
