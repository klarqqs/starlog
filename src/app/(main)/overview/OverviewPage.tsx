'use client';

import { Column, Row } from '@umami/react-zen';
import { Empty } from '@/components/common/Empty';
import { PageBody } from '@/components/common/PageBody';
import { PageHeader } from '@/components/common/PageHeader';
import { Panel } from '@/components/common/Panel';
import { useLoginQuery, useMyOverviewQuery, useNavigation } from '@/components/hooks';
import { AiSummaryButton } from '@/components/input/AiSummaryButton';
import { DateFilter } from '@/components/input/DateFilter';
import { ROLES } from '@/lib/constants';
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
        {empty ? (
          <Panel>
            <EmptyAction canAdd={canAdd} teamId={teamId} />
          </Panel>
        ) : (
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
        )}
      </Column>
    </PageBody>
  );
}

export function EmptyAction({ canAdd, teamId }: { canAdd: boolean; teamId?: string }) {
  return (
    <Column alignItems="center" justifyContent="center" gap="4" minHeight="240px">
      <Empty />
      {canAdd && <WebsiteAddButton teamId={teamId} />}
    </Column>
  );
}
