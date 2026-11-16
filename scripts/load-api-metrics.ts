import 'dotenv/config';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { uuid } from '../src/lib/crypto';
import prisma from '../src/lib/prisma';
import { handleOtlpRequest } from '../src/stellog/handler';
import { createIngestKey } from '../src/stellog/ingest-key';
import { rollupForWebsite } from '../src/stellog/metrics-store';

const targetRps = 1_000_000 / 86_400;
const seconds = numberArg('--seconds', 15);
const burstSpans = numberArg('--burst', 2000);
const port = numberArg('--port', 3099);

const websiteId = uuid();
let exitCode = 0;

try {
  await prisma.client.website.create({ data: { id: websiteId, name: 'load' } });
  const key = await createIngestKey(websiteId, 'load');
  const bytesBefore = await tableBytes();
  const server = createServer((req, res) => {
    void serve(req, res, key.token);
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });

  try {
    const sustained = await runRate(seconds, key.token);
    const burst = await runBurst(burstSpans, key.token);
    const rollup = await rollupForWebsite(websiteId);
    const stored = rollup.hours.reduce((sum, row) => sum + row.requestCount, 0);
    console.log(
      JSON.stringify(
        {
          targetPerDay: 1_000_000,
          targetRps: round(targetRps),
          sustained,
          burst,
          storedRequests: stored,
          normalizedRoute: rollup.hours[0]?.route ?? null,
          bytesBefore,
          bytesAfter: await tableBytes(),
        },
        null,
        2,
      ),
    );
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
} catch (error) {
  exitCode = 1;
  console.error(error);
} finally {
  await prisma.client.website.delete({ where: { id: websiteId } }).catch(() => undefined);
  process.exit(exitCode);
}

async function serve(req: IncomingMessage, res: ServerResponse, token: string) {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  const request = new Request(`http://127.0.0.1:${port}${req.url}`, {
    method: req.method,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: Buffer.concat(chunks),
  });
  const response = await handleOtlpRequest(request, 'traces');
  res.statusCode = response.status;
  res.end(Buffer.from(await response.arrayBuffer()));
}

async function runRate(durationSeconds: number, token: string) {
  const total = Math.max(1, Math.round(targetRps * durationSeconds));
  const interval = 1000 / targetRps;
  const started = performance.now();
  const samples: Array<{ status: number; ms: number }> = [];
  let inFlight = 0;

  for (let i = 0; i < total; i++) {
    const due = started + i * interval;
    const wait = due - performance.now();
    if (wait > 0) await sleep(wait);
    while (inFlight >= 32) await sleep(2);
    inFlight += 1;
    const sent = performance.now();
    void post(oneSpan(), token)
      .then(status => samples.push({ status, ms: performance.now() - sent }))
      .finally(() => {
        inFlight -= 1;
      });
  }

  while (samples.length < total) await sleep(5);
  return summarize(samples, (performance.now() - started) / 1000);
}

async function runBurst(spans: number, token: string) {
  const batchSize = 20;
  const requests = Math.ceil(spans / batchSize);
  const started = performance.now();
  const samples: Array<{ status: number; ms: number }> = [];
  for (let i = 0; i < requests; i++) {
    const sent = performance.now();
    const status = await post(manySpans(batchSize), token);
    samples.push({ status, ms: performance.now() - sent });
  }
  const secondsSpent = (performance.now() - started) / 1000;
  const summary = summarize(samples, secondsSpent);
  return {
    ...summary,
    spans: requests * batchSize,
    spansPerSecond: round((requests * batchSize) / secondsSpent),
  };
}

function summarize(samples: Array<{ status: number; ms: number }>, secondsSpent: number) {
  const ok = samples.filter(sample => sample.status === 200).length;
  const latencies = samples.map(sample => sample.ms).sort((a, b) => a - b);
  return {
    requests: samples.length,
    ok,
    failed: samples.length - ok,
    seconds: round(secondsSpent),
    requestsPerSecond: round(samples.length / secondsSpent),
    p50ms: round(percentile(latencies, 0.5)),
    p95ms: round(percentile(latencies, 0.95)),
  };
}

function oneSpan() {
  return spans(1);
}

function manySpans(count: number) {
  return spans(count);
}

function spans(count: number) {
  const end = BigInt(Date.now()) * 1_000_000n;
  const start = end - 12_000_000n;
  const account = `G${'A'.repeat(55)}`;
  return JSON.stringify({
    resourceSpans: [
      {
        resource: { attributes: [{ key: 'service.name', value: { stringValue: 'load' } }] },
        scopeSpans: [
          {
            spans: Array.from({ length: count }, () => ({
              startTimeUnixNano: start.toString(),
              endTimeUnixNano: end.toString(),
              attributes: [
                {
                  key: 'http.target',
                  value: { stringValue: `/accounts/${account}/orders/42?x=1` },
                },
                { key: 'http.response.status_code', value: { intValue: 200 } },
              ],
            })),
          },
        ],
      },
    ],
  });
}

async function post(body: string, token: string) {
  const response = await fetch(`http://127.0.0.1:${port}/v1/traces`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body,
  });
  await response.arrayBuffer();
  return response.status;
}

function percentile(sorted: number[], p: number) {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1);
  return sorted[Math.max(0, index)];
}

function numberArg(flag: string, fallback: number) {
  const index = process.argv.indexOf(flag);
  if (index === -1) return fallback;
  const value = Number(process.argv[index + 1]);
  return Number.isFinite(value) ? value : fallback;
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function tableBytes() {
  const rows = (await prisma.client.$queryRawUnsafe(
    `SELECT c.relname AS name, pg_total_relation_size(c.oid) AS bytes
     FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relname IN ('api_metric_raw', 'api_metric_hour', 'api_metric_day', 'api_metric_cursor')
     ORDER BY c.relname`,
  )) as Array<{ name: string; bytes: bigint }>;
  return Object.fromEntries(rows.map(row => [row.name, Number(row.bytes)]));
}
