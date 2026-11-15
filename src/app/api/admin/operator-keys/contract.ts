import { z } from 'zod';
import { defineOperation } from '@/openapi/operation';
import { badRequestResponse, jsonResponse, unauthorizedResponse } from '@/openapi/schemas';
import { createdSecretSchema } from '../../operator/schema';

const keyRow = z.object({
  id: z.uuid(),
  name: z.string(),
  keyPrefix: z.string(),
  createdAt: z.string(),
  revokedAt: z.string().nullable(),
  lastUsedAt: z.string().nullable(),
});

const listKeys = defineOperation({
  method: 'get',
  path: '/api/admin/operator-keys',
  audience: 'internal',
  auth: 'bearer',
  operation: {
    operationId: 'listOperatorKeys',
    summary: 'List operator keys',
    description: 'Returns prefixes and status. The secret and its hash are not included.',
    tags: ['Administration'],
    responses: {
      '200': jsonResponse(z.object({ keys: z.array(keyRow) }), 'Operator keys.'),
      '401': unauthorizedResponse,
    },
  },
});

const createKey = defineOperation({
  method: 'post',
  path: '/api/admin/operator-keys',
  audience: 'internal',
  auth: 'bearer',
  operation: {
    operationId: 'createOperatorKey',
    summary: 'Create an operator key',
    description:
      'The opk_ token is returned once. Only its hash is stored. The key can read project metrics and cannot change them.',
    tags: ['Administration'],
    requestBody: {
      required: true,
      content: {
        'application/json': { schema: z.object({ name: z.string().min(1).max(100) }) },
      },
    },
    responses: {
      '200': jsonResponse(createdSecretSchema, 'The new key. Copy the token now.'),
      '400': badRequestResponse,
      '401': unauthorizedResponse,
    },
  },
});

export const operations = [listKeys, createKey] as const;
