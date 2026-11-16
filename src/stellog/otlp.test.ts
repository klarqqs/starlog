import { describe, expect, test } from 'vitest';
import { extractSignal } from './otlp';

const now = new Date('2026-11-15T20:00:00.000Z');
const endNano = String(now.getTime() * 1e6);
const startNano = String(now.getTime() * 1e6 - 12e6);
const account = `G${'A'.repeat(55)}`;

function span(
  attributes: Array<{ key: string; value: Record<string, unknown> }>,
  extra: Record<string, unknown> = {},
) {
  return {
    traceId: 'trace-secret',
    spanId: 'span-secret',
    name: 'GET',
    startTimeUnixNano: startNano,
    endTimeUnixNano: endNano,
    attributes,
    events: [{ name: 'secret-event', attributes: [] }],
    ...extra,
  };
}

describe('extractSignal traces', () => {
  test('keeps route, status, and latency, and drops the span body', () => {
    const extracted = extractSignal(
      'traces',
      {
        resourceSpans: [
          {
            resource: {
              attributes: [{ key: 'service.name', value: { stringValue: 'payments' } }],
            },
            scopeSpans: [
              {
                spans: [
                  span([
                    { key: 'http.target', value: { stringValue: `/accounts/${account}?x=1` } },
                    { key: 'http.response.status_code', value: { intValue: '201' } },
                    { key: 'user.email', value: { stringValue: 'person@example.com' } },
                  ]),
                ],
              },
            ],
          },
        ],
      },
      now,
    );

    if ('error' in extracted) throw new Error(extracted.error);
    expect(extracted.observations).toHaveLength(1);
    const row = extracted.observations[0];
    expect(row.route).toBe('/accounts/{account}');
    expect(row.statusCode).toBe(201);
    expect(row.latencyMs).toBe(12);
    expect(row.serviceName).toBe('payments');
    expect(row.count).toBe(1);
    expect(JSON.stringify(row)).not.toContain('person@example.com');
    expect(JSON.stringify(row)).not.toContain('trace-secret');
    expect(JSON.stringify(row)).not.toContain('secret-event');
  });

  test('prefers http.route over the raw path', () => {
    const extracted = extractSignal(
      'traces',
      {
        resourceSpans: [
          {
            scopeSpans: [
              {
                spans: [
                  span([
                    { key: 'http.route', value: { stringValue: '/accounts/{id}' } },
                    { key: 'url.path', value: { stringValue: `/accounts/${account}` } },
                    { key: 'http.status_code', value: { intValue: 200 } },
                  ]),
                ],
              },
            ],
          },
        ],
      },
      now,
    );
    if ('error' in extracted) throw new Error(extracted.error);
    expect(extracted.observations[0].route).toBe('/accounts/{id}');
  });

  test('skips a span that has no route or status', () => {
    const extracted = extractSignal(
      'traces',
      { resourceSpans: [{ scopeSpans: [{ spans: [span([])] }] }] },
      now,
    );
    if ('error' in extracted) throw new Error(extracted.error);
    expect(extracted.observations).toHaveLength(0);
    expect(extracted.skipped).toBe(1);
  });
});

describe('extractSignal metrics', () => {
  test('reads a delta histogram and converts seconds to milliseconds', () => {
    const extracted = extractSignal(
      'metrics',
      {
        resourceMetrics: [
          {
            resource: {
              attributes: [
                { key: 'service.name', value: { stringValue: 'api' } },
                { key: 'tenant.id', value: { stringValue: 'Tenant-A' } },
              ],
            },
            scopeMetrics: [
              {
                metrics: [
                  {
                    name: 'http.server.request.duration',
                    unit: 's',
                    histogram: {
                      aggregationTemporality: 1,
                      dataPoints: [
                        {
                          attributes: [
                            { key: 'http.route', value: { stringValue: '/orders/{id}' } },
                            { key: 'http.response.status_code', value: { intValue: 200 } },
                          ],
                          timeUnixNano: endNano,
                          count: '4',
                          sum: 0.04,
                          explicitBounds: [0.01, 0.1],
                          bucketCounts: ['1', '3', '0'],
                          exemplars: [{ spanId: 'secret-exemplar' }],
                        },
                      ],
                    },
                  },
                ],
              },
            ],
          },
        ],
      },
      now,
    );

    if ('error' in extracted) throw new Error(extracted.error);
    expect(extracted.tenantIds).toEqual(['tenant-a']);
    const row = extracted.observations[0];
    expect(row.route).toBe('/orders/{id}');
    expect(row.count).toBe(4);
    expect(row.latencySumMs).toBeCloseTo(40);
    expect(row.hist.h10).toBe(1);
    expect(row.hist.h100).toBe(4);
    expect(row.temporality).toBe('delta');
    expect(JSON.stringify(row)).not.toContain('secret-exemplar');
  });

  test('marks cumulative sums', () => {
    const extracted = extractSignal(
      'metrics',
      {
        resourceMetrics: [
          {
            scopeMetrics: [
              {
                metrics: [
                  {
                    name: 'http.server.requests',
                    sum: {
                      aggregationTemporality: 2,
                      isMonotonic: true,
                      dataPoints: [
                        {
                          attributes: [
                            { key: 'http.route', value: { stringValue: '/health' } },
                            { key: 'http.response.status_code', value: { intValue: '204' } },
                          ],
                          timeUnixNano: endNano,
                          asInt: '9',
                        },
                      ],
                    },
                  },
                ],
              },
            ],
          },
        ],
      },
      now,
    );
    if ('error' in extracted) throw new Error(extracted.error);
    expect(extracted.observations[0]).toMatchObject({
      route: '/health',
      statusCode: 204,
      count: 9,
      temporality: 'cumulative',
      hasLatency: false,
      hist: {
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
      },
    });
  });
});

describe('extractSignal logs', () => {
  test('accepts logs and returns no observations', () => {
    const extracted = extractSignal(
      'logs',
      {
        resourceLogs: [
          { scopeLogs: [{ logRecords: [{ body: { stringValue: 'secret-log-line' } }] }] },
        ],
      },
      now,
    );
    if ('error' in extracted) throw new Error(extracted.error);
    expect(extracted.observations).toEqual([]);
    expect(JSON.stringify(extracted)).not.toContain('secret-log-line');
  });
});
