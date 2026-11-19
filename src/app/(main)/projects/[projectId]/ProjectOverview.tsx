'use client';

import { Column, Row } from '@umami/react-zen';
import { WebsiteControls } from '@/app/(main)/websites/[websiteId]/WebsiteControls';
import { ExpandedViewModal } from '@/app/(main)/websites/[websiteId]/ExpandedViewModal';
import { LedgerReports } from '@/app/(main)/websites/[websiteId]/ledger/LedgerPage';
import { WebsiteChart } from '@/app/(main)/websites/[websiteId]/WebsiteChart';
import { WebsitePanels } from '@/app/(main)/websites/[websiteId]/WebsitePanels';
import { EmptyCard } from '@/components/common/EmptyPlaceholder';
import { Favicon } from '@/components/common/Favicon';
import Link from '@/components/common/Link';
import { PageBody } from '@/components/common/PageBody';
import { PageHeader } from '@/components/common/PageHeader';
import { Panel } from '@/components/common/Panel';
import { useApi, useDateParameters, useDateRange, useLoginQuery, useNavigation } from '@/components/hooks';
import { ChevronDown, ChevronUp } from '@/components/icons';
import { UnitFilter } from '@/components/input/UnitFilter';
import { formatLatency, formatRate, formatTrend } from '@/components/metrics/Fleet';
import { ROLES } from '@/lib/constants';
import { formatLongNumber } from '@/lib/format';
import { displayedTrend } from '@/stellog/demo-series';
import type { LedgerRow } from '@/stellog/ledger';
import { propertyLabel, type OperatorProject } from '@/stellog/operator-report';
import { isReadOnlyOperator } from '@/stellog/project-nav';
import { WebsiteAddButton } from '../../websites/WebsiteAddButton';
import { useProjectView } from './useProjectView';

export function ProjectOverview({ projectId }: { projectId: string }) {
  const { user } = useLoginQuery();
  const canAdd = !!user && user.role !== ROLES.viewOnly && !isReadOnlyOperator(user);
  const projectQuery = useProjectView(projectId);
  const view = projectQuery.data;
  const project = view?.project;
  const site = view?.sites[0];
  const api = view?.apis[0];

  return (
    <PageBody>
      <Column margin="2" gap="6">
        {projectQuery.isLoading && <OverviewShimmer />}
        {projectQuery.error && <p className="stellog-overview-note">This project could not be loaded.</p>}
        {project && (
          <PageHeader
            title={project.name}
            mark={<ProjectMark name={project.name} domain={project.domain} />}
          >
            <span className="stellog-property-label">
              ({propertyLabel(project.sites, project.apis)})
            </span>
          </PageHeader>
        )}
        {project && (
          <OverviewLayout
            projectId={projectId}
            project={project}
            siteId={site?.id}
            apiId={api?.id}
            canAdd={canAdd}
            empty={!site && !api}
          />
        )}
      </Column>
    </PageBody>
  );
}

function OverviewLayout({
  projectId,
  project,
  siteId,
  apiId,
  canAdd,
  empty,
}: {
  projectId: string;
  project: OperatorProject;
  siteId?: string;
  apiId?: string;
  canAdd: boolean;
  empty: boolean;
}) {
  const websiteId = siteId ?? apiId;

  return (
    <div className="stellog-overview">
      <WebsiteControls websiteId={websiteId} allowDownload={false} />

      {empty ? (
        <Panel>
          <EmptyCard title="No properties" description="Add a website or an API.">
            {canAdd && (
              <div className="stellog-overview-add">
                <WebsiteAddButton teamId={projectId} kind="site" />
                <WebsiteAddButton teamId={projectId} kind="api" />
              </div>
            )}
          </EmptyCard>
        </Panel>
      ) : (
        <>
          <MetricRow project={project} siteId={siteId} />
          {siteId && (
            <Panel minHeight="520px">
              <Row justifyContent="end">
                <UnitFilter />
              </Row>
              <WebsiteChart websiteId={siteId} />
            </Panel>
          )}
          {siteId && <RecentActivity projectId={projectId} siteId={siteId} />}
          {siteId && <WebsitePanels websiteId={siteId} />}
          {siteId && <ExpandedViewModal websiteId={siteId} />}
        </>
      )}
    </div>
  );
}

function MetricRow({ project, siteId }: { project: OperatorProject; siteId?: string }) {
  const { dateRange } = useDateRange();
  const length = dateRange.endDate.getTime() - dateRange.startDate.getTime();
  const ledger = useLedger(siteId);
  const previous = useLedger(siteId, {
    startAt: dateRange.startDate.getTime() - length,
    endAt: dateRange.startDate.getTime(),
  });
  const walletCount = countName(ledger.data, 'wallet_created');
  const walletPrevious = countName(previous.data, 'wallet_created');
  const site = project.sites > 0;
  const api = project.apis > 0;

  return (
    <div className="stellog-overview-metrics">
      <StatCard
        label="Visitors"
        empty={!site}
        value={formatLongNumber(project.visitors)}
        trend={trendParts(project.visitorsGrowth, project.visitors, project.visitorsPrevious)}
      />
      <StatCard
        label="Pageviews"
        empty={!site}
        value={formatLongNumber(project.pageviews)}
        trend={trendParts(project.pageviewsGrowth, project.pageviews, project.pageviewsPrevious)}
      />
      <StatCard
        label="API requests"
        empty={!api}
        value={formatLongNumber(project.requests)}
        trend={trendParts(project.requestsGrowth, project.requests, project.requestsPrevious)}
        detail={apiDetail(project)}
      />
      <StatCard
        label="Wallets"
        empty={!siteId}
        loading={!!siteId && ledger.isLoading}
        value={walletCount.toLocaleString()}
        trend={
          previous.data
            ? trendParts(walletGrowth(walletCount, walletPrevious), walletCount, walletPrevious)
            : null
        }
      />
    </div>
  );
}

function RecentActivity({ projectId, siteId }: { projectId: string; siteId: string }) {
  const { query } = useNavigation();

  return (
    <LedgerReports
      websiteId={siteId}
      summary="none"
      limit={5}
      header={
        <div className="stellog-overview-card-head">
          <h2>Recent activity</h2>
          <Link className="stellog-overview-link" href={ledgerHref(projectId, query.date)}>
            View all
          </Link>
        </div>
      }
    />
  );
}

function StatCard({
  label,
  value,
  trend,
  detail,
  empty,
  loading,
}: {
  label: string;
  value?: string;
  trend?: { text: string; up: boolean } | null;
  detail?: string;
  empty?: boolean;
  loading?: boolean;
}) {
  return (
    <section className="stellog-overview-card stellog-stat">
      <div className="stellog-stat-label">{label}</div>
      {empty ? (
        <div className="stellog-stat-empty">Not connected</div>
      ) : loading ? (
        <div className="stellog-shimmer" style={{ height: 28, width: '60%' }} />
      ) : (
        <>
          <div className="stellog-stat-row">
            <div className="stellog-stat-value">{value}</div>
            {trend && trend.text !== '—' && trend.text !== 'new' && (
              <span className={trend.up ? 'stellog-delta stellog-delta-up' : 'stellog-delta'}>
                {trend.up ? <ChevronUp size={12} /> : trend.text.startsWith('-') ? <ChevronDown size={12} /> : null}
                {trend.text}
              </span>
            )}
          </div>
          {detail && <div className="stellog-stat-detail">{detail}</div>}
        </>
      )}
    </section>
  );
}

function OverviewShimmer() {
  return (
    <div className="stellog-overview" aria-hidden="true">
      <div className="stellog-shimmer" style={{ height: 36, width: 180 }} />
      <div className="stellog-shimmer" style={{ height: 14, width: 110 }} />
      <div className="stellog-overview-metrics">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="stellog-shimmer stellog-stat-shimmer" />
        ))}
      </div>
      <div className="stellog-shimmer" style={{ height: 280 }} />
    </div>
  );
}

function useLedger(websiteId?: string, range?: { startAt: number; endAt: number }) {
  const { get, useQuery } = useApi();
  const params = useDateParameters();
  const startAt = range?.startAt ?? params.startAt;
  const endAt = range?.endAt ?? params.endAt;

  return useQuery({
    queryKey: ['overview-ledger', websiteId, startAt, endAt],
    queryFn: () =>
      get(websiteId ? `/websites/${websiteId}/ledger` : '/me/ledger', {
        startAt,
        endAt,
      }) as Promise<LedgerRow[]>,
    enabled: !!websiteId,
  });
}

function countName(rows: LedgerRow[] | undefined, name: string) {
  return (rows ?? []).filter(row => row.name === name).length;
}

function walletGrowth(current: number, previous: number) {
  if (previous === 0) return current === 0 ? 0 : null;
  return (current - previous) / previous;
}

function trendParts(growth: number | null, current: number, previous: number) {
  const text = formatTrend(growth, current, previous);
  const shown = displayedTrend(growth);
  const pct = shown == null ? 0 : Math.round(shown * 100);
  return { text, up: pct > 0 && text !== 'new' && text !== '—' };
}

function apiDetail(project: OperatorProject) {
  const errors = project.requests ? formatRate(project.errorRate) : '0%';
  return `${errors} errors · p95 ${formatLatency(project.p95, project.p95Capped)}`;
}

function ProjectMark({ name, domain }: { name: string; domain: string | null }) {
  if (domain) {
    return (
      <span className="stellog-project-mark">
        <Favicon domain={domain} />
      </span>
    );
  }
  const letter = name.trim().charAt(0).toUpperCase() || '?';
  return (
    <span className="stellog-project-mark stellog-project-initial" aria-hidden="true">
      {letter}
    </span>
  );
}

function ledgerHref(projectId: string, date: unknown) {
  if (!date) return `/projects/${projectId}/ledger`;
  return `/projects/${projectId}/ledger?date=${encodeURIComponent(String(date))}`;
}
