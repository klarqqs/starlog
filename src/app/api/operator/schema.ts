import { z } from 'zod';

const latency = {
  p50: z.number().nullable(),
  p95: z.number().nullable(),
  p50Capped: z.boolean(),
  p95Capped: z.boolean(),
};

export const operatorProjectSchema = z
  .object({
    id: z.string(),
    type: z.enum(['team', 'website']),
    name: z.string(),
    status: z.enum(['active', 'pending']),
    properties: z.number().int(),
    pendingProperties: z.number().int(),
    websiteIds: z.array(z.uuid()),
    pageviews: z.number().int(),
    visitors: z.number().int(),
    requests: z.number().int(),
    errors: z.number().int(),
    errorRate: z.number(),
    ...latency,
  })
  .meta({ id: 'OperatorProject' });

export const operatorMetricsQuerySchema = z.object({
  startAt: z.coerce.number().int(),
  endAt: z.coerce.number().int(),
  unit: z.enum(['minute', 'hour', 'day', 'week', 'month', 'year']).optional(),
  q: z.string().max(100).optional(),
  status: z.enum(['active', 'pending', 'all']).optional(),
  sort: z.enum(['name', 'pageviews', 'visitors', 'requests', 'errors', 'p95']).optional(),
  order: z.enum(['asc', 'desc']).optional(),
});

export const createdSecretSchema = z
  .object({
    id: z.uuid(),
    name: z.string(),
    prefix: z.string(),
    token: z.string(),
  })
  .meta({ id: 'CreatedSecret' });
