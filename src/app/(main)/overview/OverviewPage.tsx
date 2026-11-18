'use client';

import { Column, Row } from '@umami/react-zen';
import { CreateProjectButton } from '@/app/(main)/projects/ProjectsPage';
import { EmptyCard } from '@/components/common/EmptyPlaceholder';
import Link from '@/components/common/Link';
import { PageBody } from '@/components/common/PageBody';
import { PageHeader } from '@/components/common/PageHeader';
import { Panel } from '@/components/common/Panel';
import { useLoginQuery, useMyOverviewQuery, useNavigation } from '@/components/hooks';
import { AiSummaryButton } from '@/components/input/AiSummaryButton';
import { DateFilter } from '@/components/input/DateFilter';
import { ListTable } from '@/components/metrics/ListTable';
import { MetricCard } from '@/components/metrics/MetricCard';
import { MetricsBar } from '@/components/metrics/MetricsBar';
import { ROLES } from '@/lib/constants';
import { formatLongNumber } from '@/lib/format';
import type { MySite } from '@/stellog/my-overview';
import { isReadOnlyOperator } from '@/stellog/project-nav';
import { WebsiteAddButton } from '../websites/WebsiteAddButton';
import { ProjectMetrics } from './ProjectMetrics';
import { ProjectTraffic } from './ProjectTraffic';

export function OverviewPage() {
  const { user } = useLoginQuery();
  const { teamId } = useNavigation();
  const { data, isLoading, error, value, setValue } = useMyOverviewQuery();
  const canAdd = !!user && user.role !== ROLES.viewOnly && !isReadOnlyOperator(user);
  const empty = data?.sites.length === 0;

  return (
    <PageBody>
      <Column margin="2" gap="6">
        <PageHeader title="Overview">
          <Row gap="3" alignItems="center">
            <DateFilter value={value} onChange={setValue} showAllTime={false} />
            <AiSummaryButton scope="overview" />
          </Row>
        </PageHeader>
        {empty && !teamId ? (
          <Panel>
            <EmptyCard
              title="No projects"
              description="Create a project, then add a website or an API."
            >
              {canAdd && <CreateProjectButton />}
            </EmptyCard>
          </Panel>
        ) : empty ? (
          <Panel>
            <EmptyAction canAdd={canAdd} teamId={teamId} />
          </Panel>
        ) : (
          <>
            <AccountSummary sites={data?.sites ?? []} />
            <ProjectTraffic
              afterMetrics={
                <ProjectMetrics
                  kind="usage"
                  totals={data?.totals}
                  isLoading={isLoading && !data}
                  error={error}
                />
              }
            />
          </>
        )}
      </Column>
    </PageBody>
  );
}

function AccountSummary({ sites }: { sites: MySite[] }) {
  const groups = projectGroups(sites);
  const total = groups.reduce((sum, group) => sum + group.requests, 0) || 1;

  return (
    <Panel title="Projects">
      <Column gap="4">
        <MetricsBar>
          <MetricCard label="Projects" value={groups.length} formatValue={formatLongNumber} />
          <MetricCard
            label="Sites"
            value={sites.filter(site => site.kind === 'site').length}
            formatValue={formatLongNumber}
          />
          <MetricCard
            label="APIs"
            value={sites.filter(site => site.kind === 'api').length}
            formatValue={formatLongNumber}
          />
        </MetricsBar>
        <ListTable
          title="Project"
          metric="Requests"
          data={groups.slice(0, 8).map(group => ({
            label: group.name,
            count: group.requests,
            percent: (group.requests / total) * 100,
          }))}
          renderLabel={(row, index) => <Link href={groups[index].href}>{row.label}</Link>}
        />
      </Column>
    </Panel>
  );
}

function projectGroups(sites: MySite[]) {
  const groups = new Map<string, { name: string; href: string; requests: number }>();
  for (const site of sites) {
    const key = site.teamId ?? site.websiteId;
    const current = groups.get(key) ?? {
      name: site.teamName ?? site.name,
      href: site.teamId
        ? `/projects/${site.teamId}`
        : site.kind === 'api'
          ? `/websites/${site.websiteId}/api`
          : `/websites/${site.websiteId}`,
      requests: 0,
    };
    current.requests += site.requests;
    groups.set(key, current);
  }
  return [...groups.values()].sort(
    (a, b) => b.requests - a.requests || a.name.localeCompare(b.name),
  );
}

export function EmptyAction({ canAdd, teamId }: { canAdd: boolean; teamId?: string }) {
  return (
    <EmptyCard title="No properties" description="Add a website or an API.">
      {canAdd && <WebsiteAddButton teamId={teamId} />}
    </EmptyCard>
  );
}
