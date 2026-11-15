import { describe, expect, test } from 'vitest';
import {
  histForLatency,
  histFromExplicitBuckets,
  percentileMs,
  unitToMilliseconds,
} from './histogram';

describe('histForLatency', () => {
  test('a 3ms sample increments every cumulative bucket', () => {
    const hist = histForLatency(3, 1);
    expect(hist.h5).toBe(1);
    expect(hist.h10000).toBe(1);
    expect(hist.hInf).toBe(1);
  });

  test('a 40ms sample starts at the 50ms bucket', () => {
    const hist = histForLatency(40, 2);
    expect(hist.h25).toBe(0);
    expect(hist.h50).toBe(2);
    expect(hist.hInf).toBe(2);
  });
});

describe('histFromExplicitBuckets', () => {
  test('maps source bounds in milliseconds onto the fixed buckets', () => {
    const hist = histFromExplicitBuckets([10, 100], [1, 3, 1]);
    expect(hist.h5).toBe(0);
    expect(hist.h10).toBe(1);
    expect(hist.h100).toBe(4);
    expect(hist.hInf).toBe(5);
  });
});

describe('percentileMs', () => {
  test('returns the bucket ceiling', () => {
    const fast = histForLatency(3, 10);
    const mixed = histForLatency(40, 10);
    expect(percentileMs(fast, 0.5)).toBe(5);
    expect(percentileMs(mixed, 0.95)).toBe(50);
    expect(percentileMs(histForLatency(20000, 1), 0.5)).toBe(Number.POSITIVE_INFINITY);
    expect(percentileMs(histForLatency(0, 0), 0.5)).toBeNull();
  });
});

describe('unitToMilliseconds', () => {
  test('converts seconds and leaves milliseconds', () => {
    expect(unitToMilliseconds('s')).toBe(1000);
    expect(unitToMilliseconds('ms')).toBe(1);
    expect(unitToMilliseconds('')).toBe(1);
  });
});
