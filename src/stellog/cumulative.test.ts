import { describe, expect, test } from 'vitest';
import { cumulativeDelta } from './cumulative';
import { emptyHist, histForLatency } from './histogram';

describe('cumulativeDelta', () => {
  test('the first point is stored whole', () => {
    const next = { count: 10, sum: 40, hist: histForLatency(4, 10) };
    expect(cumulativeDelta(null, next)).toEqual(next);
  });

  test('a later point stores only the increase', () => {
    const previous = { count: 10, sum: 40, hist: histForLatency(4, 10) };
    const next = { count: 15, sum: 90, hist: histForLatency(4, 15) };
    const delta = cumulativeDelta(previous, next);
    expect(delta.count).toBe(5);
    expect(delta.sum).toBe(50);
    expect(delta.hist.hInf).toBe(5);
  });

  test('a drop in the counter is treated as a reset', () => {
    const previous = { count: 15, sum: 90, hist: histForLatency(4, 15) };
    const next = { count: 4, sum: 8, hist: histForLatency(2, 4) };
    expect(cumulativeDelta(previous, next).count).toBe(4);
  });

  test('an unchanged point produces an empty delta', () => {
    const point = { count: 3, sum: 9, hist: emptyHist() };
    point.hist.hInf = 3;
    const delta = cumulativeDelta(point, point);
    expect(delta.count).toBe(0);
    expect(delta.sum).toBe(0);
  });
});
