import { describe, expect, test } from 'vitest';
import { curveDay } from './day-curve';

describe('curveDay', () => {
  test('fills every hour and keeps the totals', () => {
    const start = new Date(2026, 10, 18, 0, 0, 0, 0);
    const end = new Date(2026, 10, 18, 23, 0, 0, 0);
    const points = curveDay(
      [
        { t: '2026-11-18T20:00:00.000Z', site: 100, visitors: 40, api: 1000 },
        { t: '2026-11-18T21:00:00.000Z', site: 50, visitors: 10, api: 250 },
      ],
      start,
      end,
    );

    expect(points).toHaveLength(24);
    expect(points.reduce((sum, point) => sum + point.site, 0)).toBe(150);
    expect(points.reduce((sum, point) => sum + point.visitors, 0)).toBe(50);
    expect(points.reduce((sum, point) => sum + point.api, 0)).toBe(1250);
    expect(points[2].api).toBeLessThan(points[14].api);
    expect(points[0].api).toBeGreaterThan(0);
  });
});