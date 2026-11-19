'use client';

import { Column } from '@umami/react-zen';
import { useEffect } from 'react';
import { LoadingPanel } from '@/components/common/LoadingPanel';
import { PageHeader } from '@/components/common/PageHeader';
import { useApi, useDateRange, useNavigation } from '@/components/hooks';
import { DateFilter } from '@/components/input/DateFilter';
import { type FleetRow, FleetTable, formatLatency, formatRate, formatTrend, MetricCards } from '@/components/metrics/Fleet';
import { OverviewAudience } from '@/components/metrics/OverviewAudience';
import { TrafficChart } from '@/components/metrics/TrafficChart';
import { rememberDateRange, resolveDateRange } from '@/lib/dashboard-date';
import { curveDay } from '@/stellog/day-curve';
import { parseProjectId } from '@/stellog/operator-report';
import type { Audience } from '@/stellog/project-traffic';

type Project = {
  id: string;
  name: string;
  status: 'active' | 'pending';
  websiteIds?: string[];
  domain: string | null;
  pageviews: number;
  pageviewsPrevious: number;
  pageviewsGrowth: number | null;
  visitors: number;
  visitorsPrevious: number;
  visitorsGrowth: number | null;
  requests: number;
  errors: number;
  requestsPrevious: number;
  requestsGrowth: number | null;
  errorRate: number;
  p95: number | null;
  p95Capped: boolean;
};

type Series = { t: string; site: number; visitors: number; api: number };

export function OperatorOverviewPage() {
  const { get, useQuery } = useApi();
  const { date, dateRange } = useDateRange();
  const { router, updateParams } = useNavigation();
  const selected = resolveDateRange(date);
  const startAt = dateRange.startDate.getTime();
  const endAt = dateRange.endDate.getTime();
  const hourly = endAt - startAt <= 2 * 24 * 60 * 60 * 1000;

  useEffect(() => {
    if (new Date().getHours() >= 12 || resolveDateRange(date) !== '0day') return;
    rememberDateRange('24hour');
    router.replace(updateParams({ date: '24hour' }));
  }, [date, router, updateParams]);

  const projectsQuery = useQuery({
    queryKey: ['operator-overview', startAt, endAt],
    queryFn: () =>
      get('/admin/projects', {
        startAt,
        endAt,
        unit: dateRange.unit,
        status: 'all',
        sort: 'requests',
        order: 'desc',
      }) as Promise<{ projects: Project[]; series?: Series[]; audience?: Audience }>,
  });

  const projects = projectsQuery.data?.projects ?? [];
  const totals = fleetTotals(projects);
  const busiest = projects.find(project => project.p95 != null) ?? null;
  const series = projectsQuery.data?.series ?? [];
  const chartPoints =
    selected === '0day' ? curveDay(series, dateRange.startDate, dateRange.endDate) : series;

  return (
    <Column gap="4" className="stellog-overview-page">
      <PageHeader title="Overview">
        <DateFilter
          value={dateRange.value}
          onChange={value => {
            rememberDateRange(value);
            router.push(updateParams({ date: value }));
          }}
          showAllTime={false}
        />
      </PageHeader>
      <LoadingPanel
        data={projectsQuery.data}
        isLoading={projectsQuery.isLoading && !projectsQuery.data}
        error={projectsQuery.error}
        minHeight="136px"
      >
        <Column gap="4">
          <MetricCards
            pageviews={totals.pageviews}
            visitors={totals.visitors}
            requests={totals.requests}
            p95={formatLatency(busiest?.p95, busiest?.p95Capped)}
            pageviewsTrend={formatTrend(totals.pageviewsGrowth, totals.pageviews, totals.pageviewsPrevious)}
            visitorsTrend={formatTrend(totals.visitorsGrowth, totals.visitors, totals.visitorsPrevious)}
            requestsTrend={formatTrend(totals.requestsGrowth, totals.requests, totals.requestsPrevious)}
            errorDetail={totals.requests === 0 ? null : `${formatRate(totals.errors / totals.requests)} errors`}
          />
          <TrafficChart
            points={chartPoints}
            start={dateRange.startDate}
            end={dateRange.endDate}
            unit={hourly ? 'hour' : 'day'}
          />
          <FleetTable
            title="Top projects"
            rows={projects.slice(0, 5).map(fleetRow)}
            viewAllHref={projectsHref(dateRange.value)}
          />
          {projectsQuery.data?.audience && (
            <OverviewAudience audience={projectsQuery.data.audience} />
          )}
        </Column>
      </LoadingPanel>
    </Column>
  );
}

function projectsHref(date: string) {
  if (!date) return '/admin/projects';
  return `/admin/projects?date=${encodeURIComponent(date)}`;
}

function fleetRow(project: Project): FleetRow {
  const parsed = parseProjectId(project.id);
  return {
    id: project.id,
    name: project.name,
    domain: project.domain,
    href: parsed?.type === 'team' ? `/projects/${parsed.id}` : null,
    pageviews: project.pageviews,
    requests: project.requests,
    errorRate: project.errorRate,
    p95: project.p95,
    p95Capped: project.p95Capped,
    growth: project.requests > 0 || project.requestsPrevious > 0
      ? project.requestsGrowth
      : project.pageviewsGrowth,
    previous: project.requests > 0 || project.requestsPrevious > 0
      ? project.requestsPrevious
      : project.pageviewsPrevious,
    current: project.requests > 0 || project.requestsPrevious > 0
      ? project.requests
      : project.pageviews,
  };
}

function fleetTotals(projects: Project[]) {
  const totals = projects.reduce(
    (sum, project) => ({
      pageviews: sum.pageviews + project.pageviews,
      pageviewsPrevious: sum.pageviewsPrevious + project.pageviewsPrevious,
      visitors: sum.visitors + project.visitors,
      visitorsPrevious: sum.visitorsPrevious + (project.visitorsPrevious || 0),
      requests: sum.requests + project.requests,
      requestsPrevious: sum.requestsPrevious + project.requestsPrevious,
      errors: sum.errors + project.errors,
    }),
    {
      pageviews: 0,
      pageviewsPrevious: 0,
      visitors: 0,
      visitorsPrevious: 0,
      requests: 0,
      requestsPrevious: 0,
      errors: 0,
    },
  );
  return {
    ...totals,
    pageviewsGrowth: rate(totals.pageviews, totals.pageviewsPrevious),
    visitorsGrowth: rate(totals.visitors, totals.visitorsPrevious),
    requestsGrowth: rate(totals.requests, totals.requestsPrevious),
  };
}

function rate(current: number, previous: number) {
  if (previous === 0) return current === 0 ? 0 : null;
  return (current - previous) / previous;
}
