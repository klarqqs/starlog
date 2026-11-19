'use client';

import { Column, Text } from '@umami/react-zen';
import { EmptyCard } from '@/components/common/EmptyPlaceholder';
import { PageBody } from '@/components/common/PageBody';
import { PageHeader } from '@/components/common/PageHeader';
import { Panel } from '@/components/common/Panel';
import { useLoginQuery } from '@/components/hooks';
import { useWebsiteStatsQuery } from '@/components/hooks/queries/useWebsiteStatsQuery';
import { ROLES } from '@/lib/constants';
import { formatLongNumber, formatShortTime } from '@/lib/format';
import { isReadOnlyOperator } from '@/stellog/project-nav';
import { WebsiteAddButton } from '../../../websites/WebsiteAddButton';
import { WebsitesDataTable } from '../../../websites/WebsitesDataTable';
import { useProjectView } from '../useProjectView';

export function ProjectWebsitesPage({ projectId }: { projectId: string }) {
  const { user } = useLoginQuery();
  const projectQuery = useProjectView(projectId);
  const canAdd = !!user && user.role !== ROLES.viewOnly && !isReadOnlyOperator(user);
  const ids = projectQuery.data?.sites.map(site => site.id);

  return (
    <PageBody>
      <Column margin="2" gap="6">
        <PageHeader title="Websites">
          {canAdd && <WebsiteAddButton teamId={projectId} kind="site" />}
        </PageHeader>
        {projectQuery.isLoading && <Text>Loading websites.</Text>}
        {projectQuery.error && <Text>This project could not be loaded.</Text>}
        {projectQuery.data?.sites.map(site => (
          <SiteVisitStats key={site.id} websiteId={site.id} />
        ))}
        {ids && (
          <Panel>
            <WebsitesDataTable
              includeIds={ids}
              kind="site"
              showActions={canAdd}
              renderEmpty={() => (
                <EmptyCard title="No website yet" description="Add a website to this project." />
              )}
            />
          </Panel>
        )}
      </Column>
    </PageBody>
  );
}

function SiteVisitStats({ websiteId }: { websiteId: string }) {
  const { data, isLoading } = useWebsiteStatsQuery({ websiteId });
  if (isLoading) {
    return (
      <div className="stellog-overview-metrics" aria-hidden="true">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="stellog-shimmer stellog-visit-shimmer" />
        ))}
      </div>
    );
  }
  if (!data) return null;
  const visits = data.visits || 0;
  const bounce = visits ? `${Math.round((Math.min(visits, data.bounces) / visits) * 100)}%` : '—';
  const duration = visits ? formatShortTime(Math.abs(~~(data.totaltime / visits)), ['m', 's'], ' ') : '—';

  return (
    <div className="stellog-visit-stats">
      <div className="stellog-overview-metrics">
        <VisitStat label="Visits" value={formatLongNumber(data.visits)} />
        <VisitStat label="Views" value={formatLongNumber(data.pageviews)} />
        <VisitStat label="Bounce rate" value={bounce} />
        <VisitStat label="Visit duration" value={duration} />
      </div>
    </div>
  );
}

function VisitStat({ label, value }: { label: string; value: string }) {
  return (
    <section className="stellog-overview-card stellog-stat">
      <div className="stellog-stat-label">{label}</div>
      <div className="stellog-stat-value">{value}</div>
    </section>
  );
}
