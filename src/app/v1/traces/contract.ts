import { z } from 'zod';
import { defineOperation } from '@/openapi/operation';
import {
  badRequestResponse,
  forbiddenResponse,
  jsonResponse,
  payloadTooLargeResponse,
  unauthorizedResponse,
} from '@/openapi/schemas';

const ingest = defineOperation({
  method: 'post',
  path: '/v1/traces',
  audience: 'collect',
  auth: 'bearer',
  operation: {
    operationId: 'ingestOtlpTraces',
    summary: 'Ingest OTLP traces JSON',
    description:
      'Derives route, status, and latency from server spans, then discards the spans. Bearer token is a team ingest key. JSON, protobuf, and gzip are accepted.',
    tags: ['Collection'],
    requestBody: {
      required: true,
      content: { 'application/json': { schema: z.looseObject({}) } },
    },
    responses: {
      '200': jsonResponse(z.object({}).strict(), 'Derived metrics were stored.'),
      '400': badRequestResponse,
      '401': unauthorizedResponse,
      '403': forbiddenResponse,
      '413': payloadTooLargeResponse,
      '415': {
        description: 'Protobuf is not accepted. Send OTLP JSON.',
        content: { 'application/json': { schema: z.object({ message: z.string() }) } },
      },
    },
  },
});

export const operations = [ingest] as const;
