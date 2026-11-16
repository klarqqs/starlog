import { z } from 'zod';
import { MAX_METRICS_RANGE_MS } from '@/stellog/tenant-report';

export const operatorMetricsQuery = z.object({
  startAt: z.coerce.number().int(),
  endAt: z.coerce.number().int(),
  unit: z
    .union([z.enum(['minute', 'hour', 'day', 'week', 'month', 'year']), z.literal('')])
    .optional(),
  q: z.string().max(100).optional(),
  status: z.enum(['active', 'pending', 'all']).optional(),
  sort: z
    .enum([
      'name',
      'pageviews',
      'visitors',
      'requests',
      'errors',
      'errorRate',
      'p95',
      'pageviewsGrowth',
      'visitorsGrowth',
      'requestsGrowth',
    ])
    .optional(),
  order: z.enum(['asc', 'desc']).optional(),
});

export function metricsWindow(startAt: number, endAt: number) {
  if (endAt <= startAt) return 'endAt must be after startAt.';
  if (endAt - startAt > MAX_METRICS_RANGE_MS) return 'Date range cannot exceed one year.';
  return null;
}
