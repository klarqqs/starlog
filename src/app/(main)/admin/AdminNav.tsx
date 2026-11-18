import { Column, Row, Tooltip, TooltipTrigger } from '@umami/react-zen';
import { IconLabel } from '@/components/common/IconLabel';
import Link from '@/components/common/Link';
import { useLoginQuery, useNavigation } from '@/components/hooks';
import {
  ChartColumn,
  GitCompare,
  KeyRound,
  LayoutDashboard,
  MousePointerClick,
  Radio,
  Settings,
  ShieldCheck,
  UserPlus,
  Users,
} from '@/components/icons';
import { operatorNav } from '@/stellog/project-nav';

const icons = {
  overview: <LayoutDashboard />,
  projects: <ChartColumn />,
  realtime: <Radio />,
  events: <MousePointerClick />,
  compare: <GitCompare />,
  enrollment: <UserPlus />,
  'operator-keys': <KeyRound />,
  operators: <Users />,
  security: <ShieldCheck />,
  settings: <Settings />,
};

export function AdminNav({
  isCollapsed,
  onItemClick,
}: {
  isCollapsed?: boolean;
  onItemClick?: () => void;
}) {
  const { pathname } = useNavigation();
  const { user } = useLoginQuery();
  const items = operatorNav(!!user?.isAdmin).map(item => ({
    id: item.id,
    label: item.label,
    path: item.path,
    icon: icons[item.id],
  }));
  const selectedKey = pathname.startsWith('/projects')
    ? 'projects'
    : items.find(({ path }) => path && pathname.startsWith(path))?.id;

  return (
    <Column gap="2">
      {items.map(({ id, path, label, icon }) => {
        const isSelected = selectedKey === id;
        const content = (
          <Row
            tabIndex={0}
            alignItems="center"
            justifyContent={isCollapsed ? 'center' : undefined}
            hover={{ backgroundColor: 'surface-sunken' }}
            backgroundColor={isSelected ? 'surface-sunken' : undefined}
            borderRadius
            minHeight="9"
          >
            <IconLabel
              icon={icon}
              label={isCollapsed ? '' : label}
              weight={isSelected ? 'bold' : undefined}
              padding
            />
          </Row>
        );

        return (
          <Link key={id} href={path} role="button" onClick={onItemClick}>
            {isCollapsed ? (
              <TooltipTrigger delay={0}>
                {content}
                <Tooltip placement="right">{label}</Tooltip>
              </TooltipTrigger>
            ) : (
              content
            )}
          </Link>
        );
      })}
    </Column>
  );
}
