'use client';

import { Column, Text } from '@umami/react-zen';
import { LedgerPage } from '@/app/(main)/websites/[websiteId]/ledger/LedgerPage';
import { EmptyCard } from '@/components/common/EmptyPlaceholder';
import { PageBody } from '@/components/common/PageBody';
import { Panel } from '@/components/common/Panel';
import { useProjectView } from '../useProjectView';

export function ProjectLedgerPage({ projectId }: { projectId: string }) {
  const projectQuery = useProjectView(projectId);
  const sites = projectQuery.data?.sites ?? [];

  return (
    <PageBody>
      <Column margin="2" gap="6">
        {projectQuery.isLoading && <Text>Loading ledger.</Text>}
        {projectQuery.error && <Text>This project could not be loaded.</Text>}
        {projectQuery.data && sites.length === 0 && (
          <Panel>
            <EmptyCard
              title="No ledger"
              description="Ledger is recorded on a website. This project has none yet."
            />
          </Panel>
        )}
        {sites.map(site => (
          <Column key={site.id} gap="3">
            {sites.length > 1 && <Text weight="bold">{site.name}</Text>}
            <LedgerPage websiteId={site.id} />
          </Column>
        ))}
      </Column>
    </PageBody>
  );
}
