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
  path: '/v1/logs',
  audience: 'collect',
  auth: 'bearer',
  operation: {
    operationId: 'ingestOtlpLogs',
    summary: 'Ingest OTLP logs JSON',
    description:
      'Accepts an OTLP JSON log payload, keeps derived metrics, and discards the rest. Bearer token is a website ingest key. Protobuf is rejected.',
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
