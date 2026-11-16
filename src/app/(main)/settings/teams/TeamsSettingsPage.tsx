'use client';
import { Column } from '@umami/react-zen';
import { TeamsDataTable } from '@/app/(main)/teams/TeamsDataTable';
import { TeamsHeader } from '@/app/(main)/teams/TeamsHeader';
import { Panel } from '@/components/common/Panel';

export function TeamsSettingsPage() {
  return (
    <Column gap="6" width="100%">
      <TeamsHeader />
      <Panel width="100%">
        <TeamsDataTable />
      </Panel>
    </Column>
  );
}
