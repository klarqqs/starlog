'use client';
import { Column } from '@umami/react-zen';
import { PageBody } from '@/components/common/PageBody';
import { PageHeader } from '@/components/common/PageHeader';
import { Panel } from '@/components/common/Panel';
import { useLoginQuery, useMessages, useNavigation, useTeamMembersQuery } from '@/components/hooks';
import { ROLES } from '@/lib/constants';
import { isReadOnlyOperator } from '@/stellog/project-nav';
import { EmptyAction } from '../overview/OverviewPage';
import { WebsiteAddButton } from './WebsiteAddButton';
import { WebsitesDataTable } from './WebsitesDataTable';

export function WebsitesPage() {
  const { user } = useLoginQuery();
  const { teamId } = useNavigation();
  const { t, labels } = useMessages();
  const { data } = useTeamMembersQuery(teamId);

  const readOnly = isReadOnlyOperator(user);
  const showActions =
    !readOnly &&
    ((teamId &&
      data?.data.filter(team => team.userId === user.id && team.role !== ROLES.teamViewOnly)
        .length > 0) ||
      (!teamId && user.role !== ROLES.viewOnly));
  const canAdd = showActions && user.role !== ROLES.viewOnly;

  return (
    <PageBody>
      <Column margin="2" gap="6">
        <PageHeader title={t(labels.websites)}>
          {canAdd && <WebsiteAddButton teamId={teamId} />}
        </PageHeader>
        <Panel>
          <WebsitesDataTable
            teamId={teamId}
            kind="site"
            showActions={showActions}
            renderEmpty={() => <EmptyAction canAdd={canAdd} teamId={teamId} />}
          />
        </Panel>
      </Column>
    </PageBody>
  );
}
