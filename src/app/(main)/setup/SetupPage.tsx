'use client';

import { Column, Text } from '@umami/react-zen';
import { EmptyCard } from '@/components/common/EmptyPlaceholder';
import Link from '@/components/common/Link';
import { PageBody } from '@/components/common/PageBody';
import { PageHeader } from '@/components/common/PageHeader';
import { Panel } from '@/components/common/Panel';
import { useLoginQuery, useMyOverviewQuery, useNavigation } from '@/components/hooks';
import { ROLES } from '@/lib/constants';
import type { MySite } from '@/stellog/my-overview';
import { isReadOnlyOperator } from '@/stellog/project-nav';
import { WebsiteIngestKeys } from '../websites/[websiteId]/settings/WebsiteIngestKeys';
import { WebsiteTrackingCode } from '../websites/[websiteId]/settings/WebsiteTrackingCode';
import { WebsiteAddButton } from '../websites/WebsiteAddButton';

type Group = {
  teamId: string | null;
  name: string;
  sites: MySite[];
  apis: MySite[];
};

export function SetupPage() {
  const { user } = useLoginQuery();
  const { teamId } = useNavigation();
  const { data, isLoading, error } = useMyOverviewQuery();
  const canAdd = !!user && user.role !== ROLES.viewOnly && !isReadOnlyOperator(user);
  const groups = groupProperties(data?.sites ?? []);

  return (
    <PageBody>
      <Column gap="6" margin="2">
        <PageHeader title="Setup" />
        {isLoading && <Text>Loading properties.</Text>}
        {error && <Text>Setup could not be loaded.</Text>}
        {!isLoading && groups.length === 0 && (
          <Panel>
            <EmptyCard title="No properties" description="Add a website or an API.">
              {canAdd && (
                <Column gap="3">
                  <WebsiteAddButton teamId={teamId} kind="site" />
                  <WebsiteAddButton teamId={teamId} kind="api" />
                </Column>
              )}
            </EmptyCard>
          </Panel>
        )}
        {groups.map(group => (
          <Panel
            key={group.teamId ?? group.sites[0]?.websiteId ?? group.apis[0]?.websiteId}
            title={group.name}
          >
            <Column gap="6">
              {group.teamId && <Link href={`/projects/${group.teamId}`}>Open project</Link>}
              <Column gap="4">
                <Text weight="bold">Websites</Text>
                {group.sites.length === 0 && (
                  <EmptyCard title="No website yet" description="Add a website to this project." />
                )}
                {group.sites.map(site => (
                  <Column key={site.websiteId} gap="2">
                    <Text>{site.name}</Text>
                    <Text color="muted">{site.domain}</Text>
                    <WebsiteTrackingCode
                      websiteId={site.websiteId}
                      showHeader={false}
                      showDescription={false}
                    />
                  </Column>
                ))}
                {canAdd && <WebsiteAddButton teamId={group.teamId ?? teamId} kind="site" />}
              </Column>
              <Column gap="4">
                <Text weight="bold">APIs</Text>
                {group.apis.length === 0 && (
                  <EmptyCard title="No API yet" description="Add an API to this project." />
                )}
                {group.apis.map(site => (
                  <Text key={site.websiteId}>
                    {site.name}
                    {site.domain ? ` · ${site.domain}` : ''}
                  </Text>
                ))}
                {group.apis[0] && <WebsiteIngestKeys websiteId={group.apis[0].websiteId} compact />}
                {canAdd && <WebsiteAddButton teamId={group.teamId ?? teamId} kind="api" />}
              </Column>
            </Column>
          </Panel>
        ))}
      </Column>
    </PageBody>
  );
}

function groupProperties(sites: MySite[]): Group[] {
  const groups = new Map<string, Group>();
  for (const site of sites) {
    const key = site.teamId ?? `solo:${site.websiteId}`;
    const group = groups.get(key) ?? {
      teamId: site.teamId,
      name: site.teamName ?? site.name,
      sites: [],
      apis: [],
    };
    if (site.kind === 'api') group.apis.push(site);
    else group.sites.push(site);
    groups.set(key, group);
  }
  return [...groups.values()];
}
