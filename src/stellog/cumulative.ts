import { emptyHist, type Hist, subtractHist } from './histogram';

export type CumulativePoint = {
  count: number;
  sum: number;
  hist: Hist;
};

/**
 * Cumulative OTLP points report the total since process start.
 * The stored value is the increase since the previous point.
 * A drop in the count or the sum is a reset, and the new point is kept whole.
 */
export function cumulativeDelta(
  previous: CumulativePoint | null,
  next: CumulativePoint,
): CumulativePoint {
  if (!previous || next.count < previous.count || next.sum + 1e-9 < previous.sum) {
    return {
      count: Math.max(0, next.count),
      sum: Math.max(0, next.sum),
      hist: next.hist,
    };
  }

  return {
    count: next.count - previous.count,
    sum: Math.max(0, next.sum - previous.sum),
    hist: subtractHist(next.hist, previous.hist),
  };
}

export function zeroPoint(): CumulativePoint {
  return { count: 0, sum: 0, hist: emptyHist() };
}
