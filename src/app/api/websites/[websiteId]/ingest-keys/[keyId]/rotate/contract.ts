import { z } from 'zod';
import { defineOperation } from '@/openapi/operation';
import { jsonResponse, notFoundResponse, unauthorizedResponse } from '@/openapi/schemas';
import { createdSecretSchema } from '../../../../../operator/schema';

const rotateIngestKey = defineOperation({
  method: 'post',
  path: '/api/websites/{websiteId}/ingest-keys/{keyId}/rotate',
  audience: 'public',
  auth: 'bearer',
  operation: {
    operationId: 'rotateIngestKey',
    summary: 'Rotate an API ingest key',
    description:
      'Revokes the current key and returns a new stk_ token once. The new row records rotatedFromId.',
    tags: ['Websites'],
    requestParams: { path: z.object({ websiteId: z.uuid(), keyId: z.uuid() }) },
    responses: {
      '200': jsonResponse(createdSecretSchema, 'The replacement key. Copy the token now.'),
      '401': unauthorizedResponse,
      '404': notFoundResponse,
    },
  },
});

export const operations = [rotateIngestKey] as const;
