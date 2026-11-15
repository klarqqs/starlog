import { z } from 'zod';
import { defineOperation } from '@/openapi/operation';
import { jsonResponse, notFoundResponse, okSchema, unauthorizedResponse } from '@/openapi/schemas';

const revokeKey = defineOperation({
  method: 'delete',
  path: '/api/admin/operator-keys/{keyId}',
  audience: 'internal',
  auth: 'bearer',
  operation: {
    operationId: 'revokeOperatorKey',
    summary: 'Revoke an operator key',
    description: 'Sets revoked_at. A revoked key cannot read metrics.',
    tags: ['Administration'],
    requestParams: { path: z.object({ keyId: z.uuid() }) },
    responses: {
      '200': jsonResponse(okSchema, 'The key was revoked.'),
      '401': unauthorizedResponse,
      '404': notFoundResponse,
    },
  },
});

export const operations = [revokeKey] as const;
