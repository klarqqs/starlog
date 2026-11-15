import { z } from 'zod';
import { defineOperation } from '@/openapi/operation';
import { badRequestResponse, jsonResponse, unauthorizedResponse } from '@/openapi/schemas';
import { operatorMetricsQuerySchema, operatorProjectSchema } from '../../operator/schema';

const listAdminProjects = defineOperation({
  method: 'get',
  path: '/api/admin/projects',
  audience: 'internal',
  auth: 'bearer',
  operation: {
    operationId: 'listAdminProjects',
    summary: 'Rank projects for an admin',
    description:
      'Same ranking as the operator read API, plus the current enrollment mode. Requires an admin session. An opk_ key is rejected.',
    tags: ['Administration'],
    requestParams: { query: operatorMetricsQuerySchema },
    responses: {
      '200': jsonResponse(
        z.object({
          enrollmentMode: z.enum(['open', 'approval-required']),
          projects: z.array(operatorProjectSchema),
        }),
        'Enrollment mode and the ranked projects.',
      ),
      '400': badRequestResponse,
      '401': unauthorizedResponse,
    },
  },
});

export const operations = [listAdminProjects] as const;
