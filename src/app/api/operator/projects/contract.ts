import { z } from 'zod';
import { defineOperation } from '@/openapi/operation';
import { badRequestResponse, jsonResponse, unauthorizedResponse } from '@/openapi/schemas';
import { operatorMetricsQuerySchema, operatorProjectSchema } from '../schema';

const listOperatorProjects = defineOperation({
  method: 'get',
  path: '/api/operator/projects',
  audience: 'internal',
  auth: 'bearer',
  operation: {
    operationId: 'listOperatorProjects',
    summary: 'Rank projects for an operator',
    description:
      'Read-only ranking of teams and unteamed websites. Accepts an admin session or a live opk_ operator key. The key cannot approve, remove, or change enrollment.',
    tags: ['Administration'],
    requestParams: { query: operatorMetricsQuerySchema },
    responses: {
      '200': jsonResponse(
        z.object({ projects: z.array(operatorProjectSchema) }),
        'Projects in the requested window. Pending websites are counted, and their traffic is omitted.',
      ),
      '400': badRequestResponse,
      '401': unauthorizedResponse,
    },
  },
});

export const operations = [listOperatorProjects] as const;
