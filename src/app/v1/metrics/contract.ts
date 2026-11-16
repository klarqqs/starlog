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
  path: '/v1/metrics',
  audience: 'collect',
  auth: 'bearer',
  operation: {
    operationId: 'ingestOtlpMetrics',
    summary: 'Ingest OTLP metrics JSON',
    description:
      'Bearer token is a team ingest key (stk_). JSON and protobuf are accepted, and gzip is accepted. tenant.id or service.name must select a website of that team.',
    tags: ['Collection'],
    requestBody: {
      required: true,
      content: { 'application/json': { schema: z.looseObject({}) } },
    },
    responses: {
      '200': jsonResponse(z.object({}).strict(), 'The accepted observations were stored.'),
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
