'use client';
import { Column } from '@umami/react-zen';
import { PageHeader } from '@/components/common/PageHeader';
import { Panel } from '@/components/common/Panel';
import { useMessages } from '@/components/hooks';
import { ProfileSettings } from './ProfileSettings';

export function ProfilePage() {
  const { t, labels } = useMessages();

  return (
    <Column gap="6" width="100%">
      <PageHeader title={t(labels.profile)} />
      <Panel width="100%">
        <ProfileSettings />
      </Panel>
    </Column>
  );
}
