import { z } from 'zod';
import { defineOperation } from '@/openapi/operation';
import { badRequestResponse, jsonResponse, unauthorizedResponse } from '@/openapi/schemas';
import { operatorProjectSchema } from '../../operator/schema';

const mySiteSchema = operatorProjectSchema
  .extend({
    websiteId: z.uuid(),
    domain: z.string().nullable(),
    hasApi: z.boolean(),
  })
  .meta({ id: 'MySite' });

const getMyOverview = defineOperation({
  method: 'get',
  path: '/api/me/overview',
  audience: 'internal',
  auth: 'bearer',
  operation: {
    operationId: 'getMyOverview',
    summary: 'Overview of my sites and APIs',
    description:
      'Totals and one row per website the account owns or reaches through a team. The numbers use the same ranking as the operator view.',
    tags: ['Projects'],
    requestParams: {
      query: z.object({
        startAt: z.coerce.number().int(),
        endAt: z.coerce.number().int(),
        unit: z.enum(['minute', 'hour', 'day', 'week', 'month', 'year']).optional(),
      }),
    },
    responses: {
      '200': jsonResponse(
        z.object({ totals: operatorProjectSchema, sites: z.array(mySiteSchema) }),
        'Totals and per-site rows.',
      ),
      '400': badRequestResponse,
      '401': unauthorizedResponse,
    },
  },
});

export const operations = [getMyOverview] as const;
