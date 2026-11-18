import { Icon, Row, Text } from '@umami/react-zen';
import type { ReactNode } from 'react';
import { DataGrid } from '@/components/common/DataGrid';
import Link from '@/components/common/Link';
import { useLoginQuery, useNavigation, useUserWebsitesQuery } from '@/components/hooks';
import { Favicon } from '@/index';
import { WebsitesTable } from './WebsitesTable';

export function WebsitesDataTable({
  userId,
  teamId,
  kind,
  showActions = true,
  includeIds,
  renderEmpty,
}: {
  userId?: string;
  teamId?: string;
  kind?: 'site' | 'api';
  showActions?: boolean;
  /** When set, the table lists only these websites. An empty list shows the empty state. */
  includeIds?: string[];
  renderEmpty?: () => ReactNode;
}) {
  const { user } = useLoginQuery();
  const queryResult = useUserWebsitesQuery(
    { userId: userId || user?.id, teamId },
    includeIds ? { pageSize: 100 } : undefined,
  );
  const rows = (queryResult.data?.data ?? []).filter((row: { id: string; kind?: string }) => {
    if (includeIds && !includeIds.includes(row.id)) return false;
    if (!kind) return true;
    return (row.kind === 'api' ? 'api' : 'site') === kind;
  });
  const query = {
    ...queryResult,
    data: queryResult.data
      ? { ...queryResult.data, data: rows, count: rows.length }
      : queryResult.data,
  } as typeof queryResult;
  const { renderUrl } = useNavigation();

  const renderLink = (row: any) => (
    <Row alignItems="center" gap="3" minWidth="0" width="100%">
      <Icon size="md" color="muted" style={{ flexShrink: 0 }}>
        <Favicon domain={row.domain} />
      </Icon>
      <Text truncate title={row.name} style={{ maxWidth: '100%' }}>
        <Link href={renderUrl(`/websites/${row.id}`, false)}>{row.name}</Link>
      </Text>
    </Row>
  );

  return (
    <DataGrid query={query} allowSearch allowPaging renderEmpty={renderEmpty}>
      {({ data }) => (
        <WebsitesTable data={data} showActions={showActions} renderLink={renderLink} />
      )}
    </DataGrid>
  );
}
