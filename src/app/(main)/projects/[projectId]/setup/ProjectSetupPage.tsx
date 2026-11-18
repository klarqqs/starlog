'use client';

import { Column, Text } from '@umami/react-zen';
import { WebsiteIngestKeys } from '@/app/(main)/websites/[websiteId]/settings/WebsiteIngestKeys';
import { WebsiteTrackingCode } from '@/app/(main)/websites/[websiteId]/settings/WebsiteTrackingCode';
import { EmptyCard } from '@/components/common/EmptyPlaceholder';
import { PageBody } from '@/components/common/PageBody';
import { PageHeader } from '@/components/common/PageHeader';
import { Panel } from '@/components/common/Panel';
import { useLoginQuery } from '@/components/hooks';
import { ROLES } from '@/lib/constants';
import { isReadOnlyOperator } from '@/stellog/project-nav';
import { WebsiteAddButton } from '../../../websites/WebsiteAddButton';
import { useProjectView } from '../useProjectView';

export function ProjectSetupPage({ projectId }: { projectId: string }) {
  const { user } = useLoginQuery();
  const projectQuery = useProjectView(projectId);
  const canAdd = !!user && user.role !== ROLES.viewOnly && !isReadOnlyOperator(user);
  const sites = projectQuery.data?.sites ?? [];
  const apis = projectQuery.data?.apis ?? [];

  return (
    <PageBody>
      <Column margin="2" gap="6">
        <PageHeader title="Setup" />
        {projectQuery.isLoading && <Text>Loading setup.</Text>}
        {projectQuery.error && <Text>This project could not be loaded.</Text>}
        {projectQuery.data && (
          <>
            <Panel title="Websites">
              <Column gap="4">
                {sites.length === 0 && (
                  <EmptyCard title="No website yet" description="Add a website to this project." />
                )}
                {sites.map(site => (
                  <Column key={site.id} gap="2">
                    <Text weight="bold">{site.name}</Text>
                    {site.domain && <Text color="muted">{site.domain}</Text>}
                    <WebsiteTrackingCode
                      websiteId={site.id}
                      showHeader={false}
                      showDescription={false}
                    />
                  </Column>
                ))}
                {canAdd && <WebsiteAddButton teamId={projectId} kind="site" />}
              </Column>
            </Panel>
            <Panel title="APIs">
              <Column gap="4">
                {apis.length === 0 && (
                  <EmptyCard title="No API yet" description="Add an API to this project." />
                )}
                {apis.map(api => (
                  <Column key={api.id} gap="2">
                    <Text weight="bold">{api.name}</Text>
                    {api.domain && <Text color="muted">{api.domain}</Text>}
                  </Column>
                ))}
                {apis[0] && <WebsiteIngestKeys websiteId={apis[0].id} />}
                {canAdd && <WebsiteAddButton teamId={projectId} kind="api" />}
              </Column>
            </Panel>
          </>
        )}
      </Column>
    </PageBody>
  );
}
