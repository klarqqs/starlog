'use client';
import { Column } from '@umami/react-zen';
import { PageHeader } from '@/components/common/PageHeader';
import { Panel } from '@/components/common/Panel';
import { UserAddButton } from './UserAddButton';
import { UsersDataTable } from './UsersDataTable';

export function UsersPage() {
  const handleSave = () => {};

  return (
    <Column gap="6" margin="2">
      <PageHeader title="Operators">
        <UserAddButton onSave={handleSave} />
      </PageHeader>
      <Panel>
        <UsersDataTable />
      </Panel>
    </Column>
  );
}
