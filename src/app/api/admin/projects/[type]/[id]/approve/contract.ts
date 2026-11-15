import { z } from 'zod';
import { defineOperation } from '@/openapi/operation';
import {
  badRequestResponse,
  jsonResponse,
  notFoundResponse,
  okSchema,
  unauthorizedResponse,
} from '@/openapi/schemas';

const approveProject = defineOperation({
  method: 'post',
  path: '/api/admin/projects/{type}/{id}/approve',
  audience: 'internal',
  auth: 'bearer',
  operation: {
    operationId: 'approveProject',
    summary: 'Approve a pending project',
    description:
      'Sets a pending team and its websites, or a pending unteamed website, to active. Requires an admin session.',
    tags: ['Administration'],
    requestParams: {
      path: z.object({
        type: z.enum(['team', 'website']),
        id: z.uuid(),
      }),
    },
    responses: {
      '200': jsonResponse(okSchema, 'The project is active.'),
      '400': badRequestResponse,
      '401': unauthorizedResponse,
      '404': notFoundResponse,
    },
  },
});

export const operations = [approveProject] as const;
