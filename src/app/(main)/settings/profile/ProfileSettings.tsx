import { Column, Label, TextField } from '@umami/react-zen';
import { useLoginQuery, useMessages } from '@/components/hooks';
import { ROLES } from '@/lib/constants';

export function ProfileSettings() {
  const { user } = useLoginQuery();
  const { t, labels } = useMessages();

  if (!user) {
    return null;
  }

  const { username, role } = user;

  const renderRole = (value: string) => {
    if (value === ROLES.user) {
      return t(labels.user);
    }
    if (value === ROLES.admin) {
      return t(labels.admin);
    }
    if (value === ROLES.viewOnly) {
      return t(labels.viewOnly);
    }
    if (value === ROLES.operator) {
      return 'Operator';
    }

    return t(labels.unknown);
  };

  return (
    <Column gap="6" width="100%">
      <Column gap="2" width="100%">
        <Label>{t(labels.username)}</Label>
        <TextField value={username} isReadOnly aria-label={t(labels.username)} />
      </Column>
      <Column gap="2" width="100%">
        <Label>{t(labels.role)}</Label>
        <TextField value={renderRole(role)} isReadOnly aria-label={t(labels.role)} />
      </Column>
    </Column>
  );
}
