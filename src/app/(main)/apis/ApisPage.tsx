'use client';

import { Column, Row } from '@umami/react-zen';
import { PageBody } from '@/components/common/PageBody';
import { PageHeader } from '@/components/common/PageHeader';
import { Panel } from '@/components/common/Panel';
import { useLoginQuery, useMyOverviewQuery, useNavigation } from '@/components/hooks';
import { AiSummaryButton } from '@/components/input/AiSummaryButton';
import { DateFilter } from '@/components/input/DateFilter';
import { ROLES } from '@/lib/constants';
import type { MySite } from '@/stellog/my-overview';
import type { OperatorProject } from '@/stellog/operator-report';
import { isReadOnlyOperator } from '@/stellog/project-nav';
import { EmptyAction } from '../overview/OverviewPage';
import { ProjectMetrics } from '../overview/ProjectMetrics';
import { WebsitesDataTable } from '../websites/WebsitesDataTable';

export function ApisPage() {
  const { user } = useLoginQuery();
  const { teamId } = useNavigation();
  const { data, isLoading, error, value, setValue } = useMyOverviewQuery();
  const sites = data?.sites.filter(site => site.kind === 'api') ?? [];
  const canAdd = !!user && user.role !== ROLES.viewOnly && !isReadOnlyOperator(user);
  const hasApis = sites.length > 0;

  return (
    <PageBody>
      <Column margin="2" gap="6">
        <PageHeader title="APIs">
          {hasApis && (
            <Row gap="3" alignItems="center">
              <DateFilter value={value} onChange={setValue} showAllTime={false} />
              <AiSummaryButton scope="apis" />
            </Row>
          )}
        </PageHeader>
        {hasApis && (
          <ProjectMetrics
            kind="api"
            totals={apiTotals(sites)}
            isLoading={isLoading && !data}
            error={error}
          />
        )}
        <Panel>
          <WebsitesDataTable
            teamId={teamId}
            kind="api"
            showActions={canAdd}
            includeIds={data ? sites.map(site => site.websiteId) : []}
            renderEmpty={() => <EmptyAction canAdd={canAdd} teamId={teamId} />}
          />
        </Panel>
      </Column>
    </PageBody>
  );
}

function apiTotals(sites: MySite[]): OperatorProject {
  const add = (pick: (site: MySite) => number) => sites.reduce((sum, site) => sum + pick(site), 0);
  const requests = add(site => site.requests);
  const errors = add(site => site.errors);
  const p95 = sites.reduce<number | null>(
    (max, site) => (site.p95 !== null && (max === null || site.p95 > max) ? site.p95 : max),
    null,
  );

  return {
    id: 'team:apis',
    type: 'team',
    name: 'APIs',
    status: 'active',
    properties: sites.length,
    pendingProperties: 0,
    sites: 0,
    apis: sites.length,
    websiteIds: sites.map(site => site.websiteId),
    domain: null,
    pageviews: add(site => site.pageviews),
    visitors: add(site => site.visitors),
    requests,
    errors,
    errorRate: requests ? errors / requests : 0,
    pageviewsPrevious: add(site => site.pageviewsPrevious),
    visitorsPrevious: add(site => site.visitorsPrevious),
    requestsPrevious: add(site => site.requestsPrevious),
    pageviewsGrowth: null,
    visitorsGrowth: null,
    requestsGrowth: null,
    p50: null,
    p95,
    p50Capped: false,
    p95Capped: sites.some(site => site.p95Capped),
  };
}
