import { describe, expect, test } from 'vitest';
import { assignRouteCap, ROUTE_CAP_PER_TEAM_HOUR } from './route-cap';

describe('route cap', () => {
  test('the default cap is the named choice of 100', () => {
    expect(ROUTE_CAP_PER_TEAM_HOUR).toBe(100);
  });

  test('routes past the cap share other, and a known route stays itself', () => {
    const known = new Set<string>();
    expect(assignRouteCap(known, '/a', 2)).toBe('/a');
    expect(assignRouteCap(known, '/b', 2)).toBe('/b');
    expect(assignRouteCap(known, '/c', 2)).toBe('other');
    expect(assignRouteCap(known, '/a', 2)).toBe('/a');
    expect(known.has('other')).toBe(false);
  });
});
