import 'dotenv/config';
import { aggregateCutoff, hourCutoff, rawCutoff } from '../src/stellog/retention';

const now = new Date();
const plan = {
  rawBefore: rawCutoff(now).toISOString(),
  hourBefore: hourCutoff(now).toISOString(),
  dayBefore: aggregateCutoff(now).toISOString(),
};

if (process.env.DRY_RUN === '1') {
  console.log(JSON.stringify(plan));
  process.exit(0);
}

const { pruneApiMetrics } = await import('../src/stellog/metrics-store');
const deleted = await pruneApiMetrics(now);
console.log(JSON.stringify({ ...plan, deleted }));
