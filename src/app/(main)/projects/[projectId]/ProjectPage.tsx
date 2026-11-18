'use client';

import { Column, Row, Text } from '@umami/react-zen';
import { ApiMetricsPage } from '@/app/(main)/websites/[websiteId]/api/ApiMetricsPage';
import { WebsitePage } from '@/app/(main)/websites/[websiteId]/WebsitePage';
import { WebsiteAddButton } from '@/app/(main)/websites/WebsiteAddButton';
import { EmptyCard } from '@/components/common/EmptyPlaceholder';
import { PageBody } from '@/components/common/PageBody';
import { PageHeader } from '@/components/common/PageHeader';
import { Panel } from '@/components/common/Panel';
import { useLoginQuery } from '@/components/hooks';
import { ROLES } from '@/lib/constants';
import { propertyLabel } from '@/stellog/operator-report';
import { isReadOnlyOperator } from '@/stellog/project-nav';
import { useProjectView } from './useProjectView';

export function ProjectPage({ projectId }: { projectId: string }) {
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
        <PageHeader title={project?.name || 'Project'} />
        {projectQuery.isLoading && <Text>Loading project.</Text>}
        {projectQuery.error && <Text>This project could not be loaded.</Text>}
        {project && <Text color="muted">{propertyLabel(project.sites, project.apis)}</Text>}
        {site && <WebsitePage websiteId={site.id} />}
        {!site && api && <ApiMetricsPage websiteId={api.id} />}
        {view && !site && !api && (
          <Panel>
            <EmptyCard title="No properties" description="Add a website or an API.">
              {canAdd && (
                <Row gap="3">
                  <WebsiteAddButton teamId={projectId} kind="site" />
                  <WebsiteAddButton teamId={projectId} kind="api" />
                </Row>
              )}
            </EmptyCard>
          </Panel>
        )}
      </Column>
    </PageBody>
  );
}
