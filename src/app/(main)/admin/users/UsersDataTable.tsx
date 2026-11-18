import type { ReactNode } from 'react';
import { DataGrid } from '@/components/common/DataGrid';
import { EmptyCard } from '@/components/common/EmptyPlaceholder';
import { useUsersQuery } from '@/components/hooks';
import { UsersTable } from './UsersTable';

export function UsersDataTable({ showActions }: { showActions?: boolean; children?: ReactNode }) {
  const queryResult = useUsersQuery();

  return (
    <DataGrid
      query={queryResult}
      allowSearch={true}
      renderEmpty={() => (
        <EmptyCard title="No operators" description="Add an operator to share the SCF view." />
      )}
    >
      {({ data }) => <UsersTable data={data} showActions={showActions} />}
    </DataGrid>
  );
}
