import { DataGrid } from '@/components/common/DataGrid';
import { EmptyCard } from '@/components/common/EmptyPlaceholder';
import Link from '@/components/common/Link';
import { useLoginQuery, useNavigation, useUserTeamsQuery } from '@/components/hooks';
import { TeamsTable } from './TeamsTable';

export function TeamsDataTable() {
  const { user } = useLoginQuery();
  const query = useUserTeamsQuery(user.id);
  const { pathname } = useNavigation();
  const isSettings = pathname.includes('/settings');

  const renderLink = (row: any) => {
    return (
      <Link key={row.id} href={`${isSettings ? '/settings' : ''}/teams/${row.id}`}>
        {row.name}
      </Link>
    );
  };

  return (
    <DataGrid
      query={query}
      renderEmpty={() => (
        <EmptyCard title="No teams" description="Create a project to start a team." />
      )}
    >
      {({ data }) => {
        return <TeamsTable data={data} renderLink={renderLink} />;
      }}
    </DataGrid>
  );
}
