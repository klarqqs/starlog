import { z } from 'zod';
import { defineOperation } from '@/openapi/operation';
import { jsonResponse, serviceUnavailableResponse } from '@/openapi/schemas';

const health = z.object({ ok: z.boolean() }).meta({ id: 'Health' });

const getHealth = defineOperation({
  method: 'get',
  path: '/api/health',
  audience: 'public',
  auth: 'none',
  operation: {
    operationId: 'getHealth',
    summary: 'Check that the app can reach Postgres',
    description: 'Returns 200 when a database query succeeds and 503 when it does not.',
    tags: ['Operations'],
    responses: {
      '200': jsonResponse(health, 'The database answered.'),
      '503': serviceUnavailableResponse,
    },
  },
});

export const operations = [getHealth] as const;
