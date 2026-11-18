'use client';

import { Column, Text } from '@umami/react-zen';
import { ApiMetricsPage } from '@/app/(main)/websites/[websiteId]/api/ApiMetricsPage';
import { EmptyCard } from '@/components/common/EmptyPlaceholder';
import { PageBody } from '@/components/common/PageBody';
import { PageHeader } from '@/components/common/PageHeader';
import { Panel } from '@/components/common/Panel';
import { useLoginQuery } from '@/components/hooks';
import { ROLES } from '@/lib/constants';
import { isReadOnlyOperator } from '@/stellog/project-nav';
import { WebsiteAddButton } from '../../../websites/WebsiteAddButton';
import { useProjectView } from '../useProjectView';

export function ProjectApisPage({ projectId }: { projectId: string }) {
  const { user } = useLoginQuery();
  const projectQuery = useProjectView(projectId);
  const canAdd = !!user && user.role !== ROLES.viewOnly && !isReadOnlyOperator(user);
  const apis = projectQuery.data?.apis ?? [];

  return (
    <PageBody>
      <Column margin="2" gap="6">
        <PageHeader title="APIs">
          {canAdd && <WebsiteAddButton teamId={projectId} kind="api" />}
        </PageHeader>
        {projectQuery.isLoading && <Text>Loading APIs.</Text>}
        {projectQuery.error && <Text>This project could not be loaded.</Text>}
        {projectQuery.data && apis.length === 0 && (
          <Panel>
            <EmptyCard title="No API yet" description="Add an API to this project." />
          </Panel>
        )}
        {apis.map(api => (
          <Column key={api.id} gap="3">
            <Text weight="bold">{api.name}</Text>
            <ApiMetricsPage websiteId={api.id} />
          </Column>
        ))}
      </Column>
    </PageBody>
  );
}
