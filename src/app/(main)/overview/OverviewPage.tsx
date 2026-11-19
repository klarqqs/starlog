'use client';

import { Column, Row } from '@umami/react-zen';
import { CreateProjectButton } from '@/app/(main)/projects/ProjectsPage';
import { EmptyCard } from '@/components/common/EmptyPlaceholder';
import { PageBody } from '@/components/common/PageBody';
import { PageHeader } from '@/components/common/PageHeader';
import { Panel } from '@/components/common/Panel';
import { useLoginQuery, useMyOverviewQuery } from '@/components/hooks';
import { DateFilter } from '@/components/input/DateFilter';
import { type FleetRow, FleetTable, formatLatency, MetricCards } from '@/components/metrics/Fleet';
import { OverviewAudience } from '@/components/metrics/OverviewAudience';
import { TrafficChart } from '@/components/metrics/TrafficChart';
import { ROLES } from '@/lib/constants';
import type { MySite } from '@/stellog/my-overview';
import { isReadOnlyOperator } from '@/stellog/project-nav';

export function OverviewPage() {
  const { user } = useLoginQuery();
  const { data, isLoading, error, value, setValue, range } = useMyOverviewQuery();
  const canAdd = !!user && user.role !== ROLES.viewOnly && !isReadOnlyOperator(user);
  const empty = data?.sites.length === 0;
  const rows = projectRows(data?.sites ?? []);
  const hourly = !!range && range.endDate.getTime() - range.startDate.getTime() <= 2 * 86400000;
  const busiest = [...(data?.sites ?? [])]
    .filter(site => site.kind === 'api' && site.p95 != null)
    .sort((left, right) => right.requests - left.requests)[0];

  return (
    <PageBody>
      <Column margin="2" gap="4">
        <PageHeader title="Overview">
          <DateFilter value={value} onChange={setValue} showAllTime={false} />
        </PageHeader>
        {empty && !isLoading ? (
          <Panel>
            <EmptyCard
            title="No projects"
            description="Create a project, then add a website or an API."
          >
              {canAdd && <CreateProjectButton />}
            </EmptyCard>
          </Panel>
        ) : (
          <Column gap="4">
            <MetricCards
              pageviews={data?.totals.pageviews ?? 0}
              visitors={data?.totals.visitors ?? 0}
              requests={data?.totals.requests ?? 0}
              p95={formatLatency(busiest?.p95 ?? data?.totals.p95, busiest?.p95Capped)}
            />
            <TrafficChart
              points={data?.series ?? []}
              start={range?.startDate ?? new Date()}
              end={range?.endDate ?? new Date()}
              unit={hourly ? 'hour' : 'day'}
            />
            {rows.length > 0 && (
              <FleetTable rows={rows.slice(0, 8)} viewAllHref={projectsHref(value)} />
            )}
            {data?.audience && <OverviewAudience audience={data.audience} />}
            {isLoading && !data && <Row>Loading overview.</Row>}
            {error && !data && <Row>Overview could not be loaded.</Row>}
          </Column>
        )}
      </Column>
    </PageBody>
  );
}

function projectsHref(date: string) {
  if (!date) return '/projects';
  return `/projects?date=${encodeURIComponent(date)}`;
}

function projectRows(sites: MySite[]): FleetRow[] {
  const byTeam = new Map<string, MySite[]>();
  for (const site of sites) {
    if (!site.teamId) continue;
    const owned = byTeam.get(site.teamId) ?? [];
    owned.push(site);
    byTeam.set(site.teamId, owned);
  }
  return [...byTeam.entries()]
    .map(([teamId, owned]) => {
      const requests = owned.reduce((sum, site) => sum + site.requests, 0);
      const previousRequests = owned.reduce((sum, site) => sum + site.requestsPrevious, 0);
      const pageviews = owned.reduce((sum, site) => sum + site.pageviews, 0);
      const previousViews = owned.reduce((sum, site) => sum + site.pageviewsPrevious, 0);
      const errors = owned.reduce((sum, site) => sum + site.errors, 0);
      const api = owned.find(site => site.kind === 'api' && site.p95 != null);
      const web = owned.find(site => site.kind === 'site');
      const useApi = requests > 0 || previousRequests > 0;
      return {
        id: teamId,
        name: owned.find(site => site.teamName)?.teamName || 'Project',
        domain: web?.domain ?? null,
        href: `/projects/${teamId}`,
        pageviews,
        requests,
        errorRate: requests === 0 ? 0 : errors / requests,
        p95: api?.p95 ?? null,
        p95Capped: api?.p95Capped,
        growth: useApi
          ? previousRequests === 0
            ? requests === 0
              ? 0
              : null
            : (requests - previousRequests) / previousRequests
          : previousViews === 0
            ? pageviews === 0
              ? 0
              : null
            : (pageviews - previousViews) / previousViews,
        previous: useApi ? previousRequests : previousViews,
        current: useApi ? requests : pageviews,
      };
    })
    .sort((left, right) => right.requests - left.requests || left.name.localeCompare(right.name));
}
