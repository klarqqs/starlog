'use client';

import { LoadingPanel } from '@/components/common/LoadingPanel';
import { MetricCard } from '@/components/metrics/MetricCard';
import { MetricsBar } from '@/components/metrics/MetricsBar';
import { formatLongNumber } from '@/lib/format';
import type { OperatorProject } from '@/stellog/operator-report';

/** The same metric strip the website dashboard uses, for a project's totals. */
export function ProjectMetrics({
  totals,
  isLoading,
  error,
  kind = 'all',
}: {
  totals?: OperatorProject;
  isLoading?: boolean;
  error?: unknown;
  kind?: 'all' | 'usage' | 'api';
}) {
  const metrics = totals ? projectMetrics(totals, kind) : null;

  return (
    <LoadingPanel data={metrics} isLoading={isLoading} error={error} minHeight="136px">
      <MetricsBar>
        {metrics?.map(metric => (
          <MetricCard
            key={metric.label}
            value={metric.value}
            label={metric.label}
            change={metric.change}
            formatValue={metric.formatValue}
            reverseColors={metric.reverseColors}
            showChange
          />
        ))}
      </MetricsBar>
    </LoadingPanel>
  );
}

function projectMetrics(totals: OperatorProject, kind: 'all' | 'usage' | 'api') {
  const metrics = [
    {
      label: 'Pageviews',
      value: totals.pageviews,
      change: totals.pageviews - totals.pageviewsPrevious,
      formatValue: formatLongNumber,
    },
    {
      label: 'Visitors',
      value: totals.visitors,
      change: totals.visitors - totals.visitorsPrevious,
      formatValue: formatLongNumber,
    },
    {
      label: 'API requests',
      value: totals.requests,
      change: totals.requests - totals.requestsPrevious,
      formatValue: formatLongNumber,
    },
    {
      label: 'Error rate',
      value: totals.errorRate * 100,
      change: 0,
      formatValue: (n: number) => `${Math.round(+n)}%`,
      reverseColors: true,
    },
    {
      label: 'p95',
      value: totals.p95 ?? 0,
      change: 0,
      formatValue: (n: number) => formatLatency(n, totals),
    },
  ];

  if (kind === 'api') {
    return metrics.filter(metric => ['API requests', 'Error rate', 'p95'].includes(metric.label));
  }
  if (kind === 'usage') {
    return metrics.filter(metric => metric.label !== 'Visitors');
  }

  return metrics;
}

function formatLatency(ms: number, totals: OperatorProject) {
  if (totals.p95 === null) return '—';
  if (totals.p95Capped) return '> 10s';
  if (ms >= 1000) return `${Math.round(ms / 100) / 10}s`;
  if (ms <= 0) return '—';
  return `${Math.round(ms)} ms`;
}
