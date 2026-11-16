import { createServer } from 'node:http';
import { gzipSync } from 'node:zlib';
import { ValueType } from '@opentelemetry/api';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import {
  ProtobufLogsSerializer,
  ProtobufMetricsSerializer,
  ProtobufTraceSerializer,
} from '@opentelemetry/otlp-transformer';
import { AggregationTemporality, DataPointType } from '@opentelemetry/sdk-metrics';
import { describe, expect, test } from 'vitest';
import { collectBodyToJson } from './collect-body';
import { ingestOtlp } from './ingest';
import type { Observation } from './otlp';

const websiteA = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

function hrNow() {
  const millis = Date.now();
  return [Math.floor(millis / 1000), (millis % 1000) * 1_000_000] as [number, number];
}

function fakeSpan() {
  const time = hrNow();
  const scope = { name: 'stellog-test', version: '1' };
  const resource = {
    attributes: { 'service.name': 'api', 'tenant.id': websiteA },
  };
  return {
    name: 'GET',
    kind: 1,
    startTime: time,
    endTime: [time[0], time[1] + 5_000_000],
    attributes: {
      'http.route': '/accounts/123',
      'http.response.status_code': 200,
    },
    droppedAttributesCount: 0,
    events: [],
    droppedEventsCount: 0,
    links: [],
    droppedLinksCount: 0,
    status: { code: 0 },
    resource,
    instrumentationScope: scope,
    spanContext: () => ({
      traceId: 'ab'.repeat(16),
      spanId: 'cd'.repeat(8),
      traceFlags: 1,
    }),
  };
}

function store() {
  const inserted: Array<{ websiteId: string; rows: Observation[] }> = [];
  return {
    inserted,
    findKey: async () => ({
      teamId: '11111111-1111-1111-1111-111111111111',
      websites: [{ id: websiteA, name: 'api' }],
    }),
    insert: async (websiteId: string, rows: Observation[]) => {
      inserted.push({ websiteId, rows });
    },
  };
}

async function post(
  signal: 'metrics' | 'traces' | 'logs',
  body: Uint8Array,
  headers: Record<string, string>,
) {
  const deps = store();
  const decoded = collectBodyToJson(
    body,
    headers['content-type'],
    headers['content-encoding'] ?? null,
    signal,
  );
  expect(decoded.ok).toBe(true);
  if (!decoded.ok) return deps;
  const result = await ingestOtlp(
    {
      authorization: 'Bearer stk_test',
      signal,
      contentType: 'application/json',
      bodyText: decoded.json,
    },
    deps,
  );
  expect(result.status).toBe(200);
  return deps;
}

describe('official OTLP protobuf', () => {
  test('accepts gzip protobuf from the trace, metric, and log serializers', async () => {
    const traces = ProtobufTraceSerializer.serializeRequest([fakeSpan() as never]);
    expect(traces).toBeDefined();
    const traced = await post('traces', gzipSync(traces as Uint8Array), {
      'content-type': 'application/x-protobuf',
      'content-encoding': 'gzip',
    });
    expect(traced.inserted[0]?.rows[0]?.route).toBe('/accounts/{id}');

    const time = hrNow();
    const metrics = ProtobufMetricsSerializer.serializeRequest({
      resource: { attributes: { 'service.name': 'api', 'tenant.id': websiteA } },
      scopeMetrics: [
        {
          scope: { name: 'stellog-test' },
          metrics: [
            {
              descriptor: { name: 'http.server.requests', valueType: ValueType.INT },
              aggregationTemporality: AggregationTemporality.DELTA,
              dataPointType: DataPointType.SUM,
              isMonotonic: true,
              dataPoints: [
                {
                  startTime: time,
                  endTime: time,
                  value: 4,
                  attributes: {
                    'http.route': '/health',
                    'http.response.status_code': 200,
                  },
                },
              ],
            },
          ],
        },
      ],
    } as never);
    const measured = await post('metrics', metrics as Uint8Array, {
      'content-type': 'application/x-protobuf',
    });
    expect(measured.inserted[0]?.rows[0]?.route).toBe('/health');
    expect(measured.inserted[0]?.rows[0]?.count).toBe(4);

    const logs = ProtobufLogsSerializer.serializeRequest([
      {
        hrTime: time,
        hrTimeObserved: time,
        severityNumber: 9,
        severityText: 'INFO',
        body: 'secret-log-line',
        attributes: {},
        droppedAttributesCount: 0,
        resource: { attributes: { 'service.name': 'api' } },
        instrumentationScope: { name: 'stellog-test' },
        spanContext: fakeSpan().spanContext(),
      } as never,
    ]);
    const logged = await post('logs', logs as Uint8Array, {
      'content-type': 'application/x-protobuf',
    });
    expect(logged.inserted).toHaveLength(0);
  });

  test('the HTTP protobuf exporter can post to the collector', async () => {
    const deps = store();
    const server = createServer(async (req, res) => {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(Buffer.from(chunk));
      const decoded = collectBodyToJson(
        Buffer.concat(chunks),
        req.headers['content-type'] ?? null,
        typeof req.headers['content-encoding'] === 'string'
          ? req.headers['content-encoding']
          : null,
        'traces',
      );
      const result = decoded.ok
        ? await ingestOtlp(
            {
              authorization: req.headers.authorization ?? null,
              signal: 'traces',
              contentType: 'application/json',
              bodyText: decoded.json,
            },
            deps,
          )
        : { status: decoded.status, body: { message: decoded.message } };
      res.writeHead(result.status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(result.body));
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('no port');
    try {
      const exporter = new OTLPTraceExporter({
        url: `http://127.0.0.1:${address.port}/v1/traces`,
        headers: { Authorization: 'Bearer stk_test' },
      });
      await new Promise<void>((resolve, reject) => {
        exporter.export([fakeSpan() as never], result => {
          if (result.code === 0) resolve();
          else reject(result.error);
        });
      });
      expect(deps.inserted[0]?.websiteId).toBe(websiteA);
      expect(deps.inserted[0]?.rows[0]?.route).toBe('/accounts/{id}');
    } finally {
      await new Promise<void>(resolve => server.close(() => resolve()));
    }
  });
});
