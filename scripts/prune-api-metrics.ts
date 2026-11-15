import 'dotenv/config';
import { pruneApiMetrics } from '../src/stellog/metrics-store';

const result = await pruneApiMetrics(new Date());
console.log(JSON.stringify(result));
process.exit(0);
