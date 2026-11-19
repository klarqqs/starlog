import { describe, expect, test } from 'vitest';
import { emptyHist, histForLatency } from './histogram';
import {
  type MetricBucket,
  metricGrain,
  summarizeTenantMetrics,
  tenantMetricsWhere,
} from './tenant-report';

const websiteA = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const websiteB = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

function bucket(overrides: Partial<MetricBucket> = {}): MetricBucket {
  return {
    websiteId: websiteA,
    bucketStart: new Date('2026-11-15T20:00:00.000Z'),
    route: '/health',
    statusCode: 200,
    requestCount: 10,
    latencyCount: 10,
    ...emptyHist(),
    ...histForLatency(40, 10),
    ...overrides,
  };
}

describe('tenantMetricsWhere', () => {
  test('names one website and the selected range', () => {
    const start = new Date('2026-11-15T00:00:00.000Z');
    const end = new Date('2026-11-16T00:00:00.000Z');
    expect(tenantMetricsWhere(websiteA, start, end)).toEqual({
      websiteId: websiteA,
      bucketStart: { gte: start, lte: end },
    });
  });
});

describe('summarizeTenantMetrics', () => {
  test('drops another website even if it was passed in', () => {
    const report = summarizeTenantMetrics(
      websiteA,
      [
        bucket(),
        bucket({
          websiteId: websiteB,
          route: '/secret',
          statusCode: 500,
          requestCount: 99,
          latencyCount: 99,
          ...histForLatency(2000, 99),
        }),
      ],
      'hour',
    );

    expect(report.websiteId).toBe(websiteA);
    expect(report.requests).toBe(10);
    expect(report.routes.map(route => route.route)).toEqual(['/health']);
    expect(report.statuses.map(status => status.statusCode)).toEqual([200]);
    expect(JSON.stringify(report)).not.toContain('/secret');
    expect(JSON.stringify(report)).not.toContain(websiteB);
  });

  test('builds volume, route latency, and status share for one website', () => {
    const report = summarizeTenantMetrics(
      websiteA,
      [
        bucket({ requestCount: 8, latencyCount: 8, ...histForLatency(12, 8) }),
        bucket({
          bucketStart: new Date('2026-11-15T21:00:00.000Z'),
          route: '/orders/{id}',
          statusCode: 500,
          requestCount: 2,
          latencyCount: 2,
          ...histForLatency(80, 2),
        }),
        bucket({
          route: '/health',
          statusCode: 204,
          requestCount: 4,
          latencyCount: 0,
          ...emptyHist(),
        }),
      ],
      'hour',
    );

    expect(report.requests).toBe(14);
    expect(report.series).toEqual([
      { x: '2026-11-15T20:00:00.000Z', y: 12 },
      { x: '2026-11-15T21:00:00.000Z', y: 2 },
    ]);
    expect(report.points.map(point => ({ x: point.x, requests: point.requests, errors: point.errors }))).toEqual([
      { x: '2026-11-15T20:00:00.000Z', requests: 12, errors: 0 },
      { x: '2026-11-15T21:00:00.000Z', requests: 2, errors: 2 },
    ]);
    expect(report.routes.map(route => route.route)).toEqual(['/health', '/orders/{id}']);
    expect(report.routes[0].requests).toBe(12);
    expect(report.routes[0].p50).toBeCloseTo(17.5);
    expect(report.statuses).toEqual([
      { statusCode: 200, requests: 8, share: 8 / 14 },
      { statusCode: 204, requests: 4, share: 4 / 14 },
      { statusCode: 500, requests: 2, share: 2 / 14 },
    ]);
    expect(report.p95Capped).toBe(false);
  });
});

describe('metricGrain', () => {
  const start = new Date('2026-11-15T00:00:00.000Z');

  test('follows the selected unit', () => {
    expect(metricGrain(start, new Date('2026-11-15T12:00:00.000Z'), 'hour')).toBe('hour');
    expect(metricGrain(start, new Date('2026-12-15T00:00:00.000Z'), 'day')).toBe('day');
  });
});
