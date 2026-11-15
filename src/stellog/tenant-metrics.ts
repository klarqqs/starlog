import prisma from '@/lib/prisma';
import {
  metricGrain,
  summarizeTenantMetrics,
  type TenantMetrics,
  tenantMetricsWhere,
} from '@/stellog/tenant-report';

export async function readTenantMetrics(
  websiteId: string,
  start: Date,
  end: Date,
  unit?: string,
): Promise<TenantMetrics> {
  const grain = metricGrain(start, end, unit);
  const where = tenantMetricsWhere(websiteId, start, end);
  const rows =
    grain === 'hour'
      ? await prisma.client.apiMetricHour.findMany({ where })
      : await prisma.client.apiMetricDay.findMany({ where });

  return summarizeTenantMetrics(websiteId, rows, grain);
}
