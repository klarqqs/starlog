import { describe, expect, test } from 'vitest';
import { emptyHist } from './histogram';
import type { Observation } from './otlp';
import { startOfUtcHour } from './retention';
import { groupObservations } from './rollup';

function row(overrides: Partial<Observation>): Observation {
  return {
    serviceName: 'api',
    route: '/health',
    statusCode: 200,
    count: 1,
    latencySumMs: 10,
    latencyMs: 10,
    hasLatency: true,
    hist: {
      ...emptyHist(),
      h10: 1,
      h25: 1,
      h50: 1,
      h100: 1,
      h250: 1,
      h500: 1,
      h1000: 1,
      h2500: 1,
      h5000: 1,
      h10000: 1,
      hInf: 1,
    },
    observedAt: new Date('2026-11-15T20:15:00.000Z'),
    temporality: 'delta',
    metricName: '',
    cursor: null,
    ...overrides,
  };
}

describe('groupObservations', () => {
  test('sums rows that share an hour, route, and status, and splits the rest', () => {
    const groups = groupObservations(
      'website-a',
      [
        row({}),
        row({ observedAt: new Date('2026-11-15T20:40:00.000Z'), count: 2, latencySumMs: 20 }),
        row({ route: '/other', observedAt: new Date('2026-11-15T21:05:00.000Z') }),
      ],
      startOfUtcHour,
    );

    expect(groups).toHaveLength(2);
    const health = groups.find(group => group.route === '/health');
    expect(health?.websiteId).toBe('website-a');
    expect(health?.requestCount).toBe(3);
    expect(health?.latencySumMs).toBe(30);
    expect(health?.bucketStart.toISOString()).toBe('2026-11-15T20:00:00.000Z');
  });

  test('does not merge two websites just because the caller asks twice', () => {
    const left = groupObservations('website-a', [row({})], startOfUtcHour);
    const right = groupObservations('website-b', [row({})], startOfUtcHour);
    expect(left[0].websiteId).toBe('website-a');
    expect(right[0].websiteId).toBe('website-b');
  });
});
