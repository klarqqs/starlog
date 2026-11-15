import { z } from 'zod';
import { defineOperation } from '@/openapi/operation';
import { jsonResponse, notFoundResponse, okSchema, unauthorizedResponse } from '@/openapi/schemas';

const revokeIngestKey = defineOperation({
  method: 'delete',
  path: '/api/websites/{websiteId}/ingest-keys/{keyId}',
  audience: 'public',
  auth: 'bearer',
  operation: {
    operationId: 'revokeIngestKey',
    summary: 'Revoke an API ingest key',
    description: 'A revoked key is rejected by the collector.',
    tags: ['Websites'],
    requestParams: { path: z.object({ websiteId: z.uuid(), keyId: z.uuid() }) },
    responses: {
      '200': jsonResponse(okSchema, 'The key was revoked.'),
      '401': unauthorizedResponse,
      '404': notFoundResponse,
    },
  },
});

export const operations = [revokeIngestKey] as const;
