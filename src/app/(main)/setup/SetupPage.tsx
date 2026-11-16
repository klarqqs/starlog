'use client';

import { Column, Text } from '@umami/react-zen';
import { PageBody } from '@/components/common/PageBody';
import { PageHeader } from '@/components/common/PageHeader';
import { Panel } from '@/components/common/Panel';
import { useLoginQuery, useMyOverviewQuery, useNavigation } from '@/components/hooks';
import { ROLES } from '@/lib/constants';
import { isReadOnlyOperator } from '@/stellog/project-nav';
import { EmptyAction } from '../overview/OverviewPage';
import { WebsiteIngestKeys } from '../websites/[websiteId]/settings/WebsiteIngestKeys';
import { WebsiteTrackingCode } from '../websites/[websiteId]/settings/WebsiteTrackingCode';

export function SetupPage() {
  const { user } = useLoginQuery();
  const { teamId } = useNavigation();
  const { data, isLoading, error } = useMyOverviewQuery();
  const canAdd = !!user && user.role !== ROLES.viewOnly && !isReadOnlyOperator(user);

  return (
    <PageBody>
      <Column gap="6" margin="2">
        <PageHeader title="Setup" />
        {isLoading && <Text>Loading properties.</Text>}
        {error && <Text>Setup could not be loaded.</Text>}
        {data?.sites.length === 0 && (
          <Panel>
            <EmptyAction canAdd={canAdd} teamId={teamId} />
          </Panel>
        )}
        {data?.sites.map(site => (
          <Panel key={site.websiteId} title={site.name}>
            <Column gap="4">
              <Text color="muted">{site.domain}</Text>
              {site.hasApi ? (
                <WebsiteIngestKeys websiteId={site.websiteId} compact />
              ) : (
                <WebsiteTrackingCode
                  websiteId={site.websiteId}
                  showHeader={false}
                  showDescription={false}
                />
              )}
            </Column>
          </Panel>
        ))}
      </Column>
    </PageBody>
  );
}
