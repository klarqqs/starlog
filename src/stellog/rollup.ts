import { addHist, type Hist } from './histogram';
import type { Observation } from './otlp';

export type RollupGroup = {
  websiteId: string;
  bucketStart: Date;
  serviceName: string;
  route: string;
  statusCode: number;
  requestCount: number;
  latencySumMs: number;
  latencyCount: number;
  hist: Hist;
};

export function groupObservations(
  websiteId: string,
  rows: Observation[],
  bucket: (date: Date) => Date,
): RollupGroup[] {
  const groups = new Map<string, RollupGroup>();

  for (const row of rows) {
    const start = bucket(row.observedAt);
    const key = `${start.toISOString()}|${row.serviceName}|${row.route}|${row.statusCode}`;
    const current = groups.get(key);
    const latencyCount = row.hasLatency ? row.count : 0;
    if (!current) {
      groups.set(key, {
        websiteId,
        bucketStart: start,
        serviceName: row.serviceName,
        route: row.route,
        statusCode: row.statusCode,
        requestCount: row.count,
        latencySumMs: row.latencySumMs,
        latencyCount,
        hist: row.hist,
      });
      continue;
    }
    current.requestCount += row.count;
    current.latencySumMs += row.latencySumMs;
    current.latencyCount += latencyCount;
    current.hist = addHist(current.hist, row.hist);
  }

  return [...groups.values()];
}
