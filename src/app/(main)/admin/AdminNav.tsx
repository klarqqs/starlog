import { Column, Row, Tooltip, TooltipTrigger } from '@umami/react-zen';
import { IconLabel } from '@/components/common/IconLabel';
import Link from '@/components/common/Link';
import { NavMenu } from '@/components/common/NavMenu';
import { useLoginQuery, useMessages, useNavigation } from '@/components/hooks';
import { ArrowLeft, ChartColumn, Globe, ShieldCheck, User, Users } from '@/components/icons';

export function AdminNav({ onItemClick }: { onItemClick?: () => void }) {
  const { t, labels } = useMessages();
  const { pathname, renderUrl } = useNavigation();
  const { user } = useLoginQuery();
  const readOnly = !!user?.isOperator && !user?.isAdmin;

  const items = [
    {
      label: t(labels.manage),
      items: [
        {
          id: 'users',
          label: t(labels.users),
          path: '/admin/users',
          icon: <User />,
        },
        {
          id: 'projects',
          label: 'Projects',
          path: '/admin/projects',
          icon: <ChartColumn />,
        },
        {
          id: 'websites',
          label: t(labels.websites),
          path: '/admin/websites',
          icon: <Globe />,
        },
        {
          id: 'teams',
          label: t(labels.teams),
          path: '/admin/teams',
          icon: <Users />,
        },
        {
          id: 'security',
          label: t(labels.security),
          path: '/admin/security',
          icon: <ShieldCheck />,
        },
      ],
    },
  ];

  const visible = readOnly
    ? items.map(group => ({
        ...group,
        items: group.items.filter(item => item.id === 'projects'),
      }))
    : items;

  const selectedKey = visible
    .flatMap(e => e.items)
    ?.find(({ path }) => path && pathname.startsWith(path))?.id;

  return (
    <Column gap="2">
      <Link href={renderUrl('/websites', false)} role="button" onClick={onItemClick}>
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
      <NavMenu
        items={visible}
        selectedKey={selectedKey}
        allowMinimize={false}
        onItemClick={onItemClick}
      />
    </Column>
  );
}
