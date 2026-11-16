import { Column, Row, Tooltip, TooltipTrigger } from '@umami/react-zen';
import { IconLabel } from '@/components/common/IconLabel';
import Link from '@/components/common/Link';
import { NavMenu } from '@/components/common/NavMenu';
import { useLoginQuery, useMessages, useNavigation } from '@/components/hooks';
import { ArrowLeft, ChartColumn, KeyRound, ShieldCheck, UserPlus, Users } from '@/components/icons';
import { operatorNav } from '@/stellog/project-nav';

const icons = {
  projects: <ChartColumn />,
  enrollment: <UserPlus />,
  'operator-keys': <KeyRound />,
  operators: <Users />,
  security: <ShieldCheck />,
};

export function AdminNav({ onItemClick }: { onItemClick?: () => void }) {
  const { t, labels } = useMessages();
  const { pathname, renderUrl } = useNavigation();
  const { user } = useLoginQuery();
  const readOnly = !!user?.isOperator && !user?.isAdmin;
  const items = [
    {
      label: 'SCF',
      items: operatorNav(!!user?.isAdmin).map(item => ({
        id: item.id,
        label: item.label,
        path: item.path,
        icon: icons[item.id],
      })),
    },
  ];
  const selectedKey = items
    .flatMap(group => group.items)
    .find(({ path }) => path && pathname.startsWith(path))?.id;

  return (
    <Column gap="2">
      {!readOnly && (
        <Link href={renderUrl('/overview', false)} role="button" onClick={onItemClick}>
          <TooltipTrigger delay={0}>
            <Row
              tabIndex={0}
              alignItems="center"
              hover={{ backgroundColor: 'surface-sunken' }}
              borderRadius
              minHeight="9"
            >
              <IconLabel icon={<ArrowLeft />} label={t(labels.back)} padding />
            </Row>
            <Tooltip placement="right">{t(labels.back)}</Tooltip>
          </TooltipTrigger>
        </Link>
      )}
      <NavMenu
        items={items}
        selectedKey={selectedKey}
        allowMinimize={false}
        onItemClick={onItemClick}
      />
    </Column>
  );
}
