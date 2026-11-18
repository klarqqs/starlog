'use client';

import { Column, Text } from '@umami/react-zen';
import { EmptyCard } from '@/components/common/EmptyPlaceholder';
import { PageBody } from '@/components/common/PageBody';
import { PageHeader } from '@/components/common/PageHeader';
import { Panel } from '@/components/common/Panel';
import { useLoginQuery } from '@/components/hooks';
import { ROLES } from '@/lib/constants';
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
