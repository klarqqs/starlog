import { z } from 'zod';
import { defineOperation } from '@/openapi/operation';
import { badRequestResponse, jsonResponse, unauthorizedResponse } from '@/openapi/schemas';
import { websiteIdPathSchema } from '../../response-schema';

const latencyFields = {
  p50: z.number().nullable(),
  p95: z.number().nullable(),
  p50Capped: z.boolean(),
  p95Capped: z.boolean(),
};

const tenantMetricsSchema = z
  .object({
    websiteId: z.uuid(),
    unit: z.enum(['hour', 'day']),
    requests: z.number().int(),
    ...latencyFields,
    series: z.array(z.object({ x: z.string(), y: z.number().int() })),
    routes: z.array(z.object({ route: z.string(), requests: z.number().int(), ...latencyFields })),
    statuses: z.array(
      z.object({
        statusCode: z.number().int(),
        requests: z.number().int(),
        share: z.number(),
      }),
    ),
  })
  .meta({ id: 'TenantApiMetrics' });

const getTenantApiMetrics = defineOperation({
  method: 'get',
  path: '/api/websites/{websiteId}/api-metrics',
  audience: 'public',
  auth: 'bearer-or-share',
  operation: {
    operationId: 'getWebsiteApiMetrics',
    summary: 'API metrics for one website',
    description:
      'Request volume, route totals, status-code mix, and p50/p95 latency for the website in the path. The response never includes another website.',
    tags: ['Websites'],
    requestParams: {
      path: websiteIdPathSchema,
      query: z.object({
        startAt: z.number().int(),
        endAt: z.number().int(),
        unit: z.enum(['minute', 'hour', 'day', 'week', 'month', 'year']).optional(),
      }),
    },
    responses: {
      '200': jsonResponse(tenantMetricsSchema, 'API metrics for the requested website.'),
      '400': badRequestResponse,
      '401': unauthorizedResponse,
    },
  },
});

export const operations = [getTenantApiMetrics] as const;
