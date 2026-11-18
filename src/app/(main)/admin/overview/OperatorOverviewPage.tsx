'use client';

import { Column, Grid, Text } from '@umami/react-zen';
import type { ReactNode } from 'react';
import { LedgerReports } from '@/app/(main)/websites/[websiteId]/ledger/LedgerPage';
import Link from '@/components/common/Link';
import { LinkButton } from '@/components/common/LinkButton';
import { LoadingPanel } from '@/components/common/LoadingPanel';
import { PageHeader } from '@/components/common/PageHeader';
import { Panel } from '@/components/common/Panel';
import { useApi, useDateRange, useLoginQuery, useNavigation } from '@/components/hooks';
import { useTwoFactorStatusQuery } from '@/components/hooks/queries/useTwoFactorStatusQuery';
import { DateFilter } from '@/components/input/DateFilter';
import { ListTable } from '@/components/metrics/ListTable';
import { MetricCard } from '@/components/metrics/MetricCard';
import { MetricsBar } from '@/components/metrics/MetricsBar';
import { formatLongNumber } from '@/lib/format';
import { parseProjectId } from '@/stellog/operator-report';

type Project = {
  id: string;
  name: string;
  status: 'active' | 'pending';
  sites: number;
  apis: number;
  websiteIds?: string[];
  pageviews: number;
  visitors: number;
  requests: number;
  errors: number;
  pageviewsPrevious: number;
  visitorsPrevious: number;
  requestsPrevious: number;
  p95: number | null;
  p95Capped: boolean;
};

type KeyRow = { id: string; revokedAt: string | null };
type UserRow = { id: string; role: string };

export function OperatorOverviewPage() {
  const { get, useQuery } = useApi();
  const { user } = useLoginQuery();
  const isAdmin = !!user?.isAdmin;
  const { dateRange } = useDateRange();
  const { query, router, updateParams } = useNavigation();
  const startAt = dateRange.startDate.getTime();
  const endAt = dateRange.endDate.getTime();

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
      }) as Promise<{
        enrollmentMode: 'open' | 'approval-required';
        projects: Project[];
      }>,
  });
  const keysQuery = useQuery({
    queryKey: ['operator-keys'],
    queryFn: () => get('/admin/operator-keys') as Promise<{ keys: KeyRow[] }>,
    enabled: isAdmin,
  });
  const usersQuery = useQuery({
    queryKey: ['operator-overview-users'],
    queryFn: () => get('/admin/users', { page: 1, pageSize: 100 }) as Promise<{ data: UserRow[] }>,
    enabled: isAdmin,
  });
  const twoFactor = useTwoFactorStatusQuery(isAdmin);

  const projects = projectsQuery.data?.projects ?? [];
  const totals = fleetTotals(projects);
  const keys = keysQuery.data?.keys ?? [];
  const activeKeys = keys.filter(key => !key.revokedAt).length;
  const revokedKeys = keys.length - activeKeys;
  const operators = (usersQuery.data?.data ?? []).filter(row => row.role === 'operator').length;
  const mode = projectsQuery.data?.enrollmentMode;
  const top = projects.slice(0, 8);
  const requestTotal = totals.requests || 1;
  const slowest = slowestProject(projects);

  return (
    <Column gap="6" margin="2">
      <PageHeader title="Overview">
        <DateFilter
          value={query.date || '24hour'}
          onChange={value => router.push(updateParams({ date: value }))}
          showAllTime={false}
        />
      </PageHeader>
      <LoadingPanel
        data={projectsQuery.data}
        isLoading={projectsQuery.isLoading && !projectsQuery.data}
        error={projectsQuery.error}
        minHeight="136px"
      >
        <MetricsBar>
          <MetricCard
            label="Pageviews"
            value={totals.pageviews}
            change={totals.pageviews - totals.pageviewsPrevious}
            formatValue={formatLongNumber}
            showChange
          />
          <MetricCard
            label="Visitors"
            value={totals.visitors}
            change={totals.visitors - totals.visitorsPrevious}
            formatValue={formatLongNumber}
            showChange
          />
          <MetricCard
            label="API requests"
            value={totals.requests}
            change={totals.requests - totals.requestsPrevious}
            formatValue={formatLongNumber}
            showChange
          />
          <MetricCard
            label="Error rate"
            value={totals.errorRate * 100}
            formatValue={rate => `${Math.round(rate)}%`}
            reverseColors
          />
          <MetricCard
            label="API errors"
            value={totals.errors}
            formatValue={formatLongNumber}
            reverseColors
          />
          <MetricCard
            label="Slowest p95"
            value={slowest?.p95 ?? 0}
            formatValue={() => latencyLabel(slowest)}
          />
        </MetricsBar>
      </LoadingPanel>
      <LedgerReports />
      <Grid columns={{ base: '1fr', lg: '1fr 1fr' }} gap="6">
        <Section title="Projects" href="/admin/projects">
          <MetricsBar>
            <MetricCard label="Projects" value={totals.projects} formatValue={formatLongNumber} />
            <MetricCard label="Sites" value={totals.sites} formatValue={formatLongNumber} />
            <MetricCard label="APIs" value={totals.apis} formatValue={formatLongNumber} />
          </MetricsBar>
          <ListTable
            title="Project"
            metric="Requests"
            data={top.map(project => ({
              label: project.name,
              count: project.requests,
              percent: (project.requests / requestTotal) * 100,
            }))}
            renderLabel={(row, index) => <Link href={projectPath(top[index])}>{row.label}</Link>}
          />
        </Section>
        <Section title="Enrollment" href={isAdmin ? '/admin/enrollment' : undefined}>
          <MetricsBar>
            <MetricCard
              label="Enrollment"
              value={0}
              formatValue={() => (mode === 'approval-required' ? 'Approval required' : 'Open')}
            />
            <MetricCard label="Pending" value={totals.pending} formatValue={formatLongNumber} />
          </MetricsBar>
        </Section>
        {isAdmin && (
          <Section title="Operator keys" href="/admin/operator-keys">
            {keysQuery.isLoading && <Text>Loading keys.</Text>}
            {keysQuery.error && <Text>Operator keys could not be loaded.</Text>}
            {keysQuery.data && (
              <MetricsBar>
                <MetricCard label="Active" value={activeKeys} formatValue={formatLongNumber} />
                <MetricCard label="Revoked" value={revokedKeys} formatValue={formatLongNumber} />
              </MetricsBar>
            )}
          </Section>
        )}
        {isAdmin && (
          <Section title="Operators" href="/admin/users">
            {usersQuery.isLoading && <Text>Loading operators.</Text>}
            {usersQuery.error && <Text>Operators could not be loaded.</Text>}
            {usersQuery.data && (
              <MetricsBar>
                <MetricCard label="Operators" value={operators} formatValue={formatLongNumber} />
              </MetricsBar>
            )}
          </Section>
        )}
        {isAdmin && (
          <Section title="Security" href="/admin/security">
            {twoFactor.isLoading && <Text>Loading security.</Text>}
            {twoFactor.error && <Text>Security could not be loaded.</Text>}
            {twoFactor.data && (
              <MetricsBar>
                <MetricCard
                  label="Two-factor"
                  value={0}
                  formatValue={() => securityLabel(twoFactor.data)}
                />
              </MetricsBar>
            )}
          </Section>
        )}
      </Grid>
    </Column>
  );
}

function Section({ title, href, children }: { title: string; href?: string; children: ReactNode }) {
  return (
    <Panel
      title={title}
      toolbar={
        href ? (
          <LinkButton href={href} variant="quiet">
            Open
          </LinkButton>
        ) : null
      }
    >
      <Column gap="4">{children}</Column>
    </Panel>
  );
}

function fleetTotals(projects: Project[]) {
  const totals = projects.reduce(
    (sum, project) => ({
      pageviews: sum.pageviews + project.pageviews,
      visitors: sum.visitors + project.visitors,
      requests: sum.requests + project.requests,
      errors: sum.errors + project.errors,
      pageviewsPrevious: sum.pageviewsPrevious + project.pageviewsPrevious,
      visitorsPrevious: sum.visitorsPrevious + project.visitorsPrevious,
      requestsPrevious: sum.requestsPrevious + project.requestsPrevious,
      sites: sum.sites + (project.sites ?? 0),
      apis: sum.apis + (project.apis ?? 0),
      pending: sum.pending + (project.status === 'pending' ? 1 : 0),
    }),
    {
      pageviews: 0,
      visitors: 0,
      requests: 0,
      errors: 0,
      pageviewsPrevious: 0,
      visitorsPrevious: 0,
      requestsPrevious: 0,
      sites: 0,
      apis: 0,
      pending: 0,
    },
  );
  return {
    ...totals,
    projects: projects.length,
    errorRate: totals.requests === 0 ? 0 : totals.errors / totals.requests,
  };
}

function slowestProject(projects: Project[]) {
  return projects.reduce<Project | null>((slowest, project) => {
    if (project.p95 == null) return slowest;
    if (!slowest || project.p95 > (slowest.p95 ?? 0)) return project;
    return slowest;
  }, null);
}

function latencyLabel(project: Project | null) {
  if (!project || project.p95 == null) return '—';
  if (project.p95Capped) return '> 10s';
  if (project.p95 >= 1000) return `${Math.round(project.p95 / 100) / 10}s`;
  return `${Math.round(project.p95)} ms`;
}

function securityLabel(
  status?: {
    isConfigured?: boolean;
    globalRequired?: boolean;
  } | null,
) {
  if (!status?.isConfigured) return 'Not configured';
  return status.globalRequired ? 'Required' : 'Off';
}

function projectPath(project: Project) {
  const parsed = parseProjectId(project.id);
  if (parsed?.type === 'team') return `/projects/${parsed.id}`;
  if (project.websiteIds?.[0]) return `/websites/${project.websiteIds[0]}`;
  return '/admin/projects';
}
