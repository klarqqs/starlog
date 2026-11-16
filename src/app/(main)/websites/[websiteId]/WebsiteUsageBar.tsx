'use client';

import { useApi, useDateRange } from '@/components/hooks';
import { useWebsiteStatsQuery } from '@/components/hooks/queries/useWebsiteStatsQuery';
import type { OperatorProject } from '@/stellog/operator-report';
import { ProjectMetrics } from '../../overview/ProjectMetrics';

type ApiMetrics = {
  requests: number;
  p95: number | null;
  p95Capped: boolean;
  statuses: Array<{ statusCode: number; requests: number }>;
};

/** Pageviews plus API requests, error rate, and p95, directly under the visit metrics. */
export function WebsiteUsageBar({ websiteId }: { websiteId: string }) {
  const { get, useQuery } = useApi();
  const { dateRange } = useDateRange();
  const stats = useWebsiteStatsQuery({ websiteId });
  const startAt = dateRange.startDate.getTime();
  const endAt = dateRange.endDate.getTime();
  const length = Math.max(endAt - startAt, 1);
  const previousEnd = startAt - 1;
  const previousStart = previousEnd - length;
  const unit = dateRange.unit;

  const current = useQuery({
    queryKey: ['api-metrics', websiteId, startAt, endAt, unit],
    queryFn: () =>
      get(`/websites/${websiteId}/api-metrics`, { startAt, endAt, unit }) as Promise<ApiMetrics>,
  });
  const previous = useQuery({
    queryKey: ['api-metrics', websiteId, previousStart, previousEnd, unit],
    queryFn: () =>
      get(`/websites/${websiteId}/api-metrics`, {
        startAt: previousStart,
        endAt: previousEnd,
        unit,
      }) as Promise<ApiMetrics>,
  });

  const totals =
    stats.data && current.data
      ? usageTotals(websiteId, stats.data, current.data, previous.data)
      : undefined;

  return (
    <ProjectMetrics
      kind="usage"
      totals={totals}
      isLoading={(stats.isLoading && !stats.data) || (current.isLoading && !current.data)}
      error={stats.error || current.error}
    />
  );
}

function usageTotals(
  websiteId: string,
  stats: { pageviews: number; comparison: { pageviews: number } },
  current: ApiMetrics,
  previous?: ApiMetrics,
): OperatorProject {
  return {
    id: websiteId,
    type: 'website',
    name: '',
    status: 'active',
    properties: 1,
    pendingProperties: 0,
    websiteIds: [websiteId],
    pageviews: stats.pageviews,
    visitors: 0,
    requests: current.requests,
    errors: 0,
    errorRate: rate(current),
    pageviewsPrevious: stats.comparison?.pageviews ?? 0,
    visitorsPrevious: 0,
    requestsPrevious: previous?.requests ?? 0,
    pageviewsGrowth: null,
    visitorsGrowth: null,
    requestsGrowth: null,
    p50: null,
    p95: current.p95,
    p50Capped: false,
    p95Capped: current.p95Capped,
  };
}

function rate(metrics: ApiMetrics) {
  if (!metrics.requests) return 0;
  const errors = metrics.statuses
    .filter(status => status.statusCode >= 500)
    .reduce((sum, status) => sum + status.requests, 0);
  return errors / metrics.requests;
}
