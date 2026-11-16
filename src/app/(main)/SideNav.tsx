import {
  Button,
  type ButtonProps,
  Column,
  Icon,
  Row,
  Text,
  Tooltip,
  TooltipTrigger,
} from '@umami/react-zen';
import { AdminNav } from '@/app/(main)/admin/AdminNav';
import { SettingsNav } from '@/app/(main)/settings/SettingsNav';
import { WebsiteNav } from '@/app/(main)/websites/[websiteId]/WebsiteNav';
import { IconLabel } from '@/components/common/IconLabel';
import Link from '@/components/common/Link';
import { OverlayScrollArea } from '@/components/common/OverlayScrollArea';
import styles from '@/components/common/OverlayScrollArea.module.css';
import { useGlobalState, useLoginQuery, useMainNavItems, useNavigation } from '@/components/hooks';
import { PanelLeft } from '@/components/icons';
import { UserButton } from '@/components/input/UserButton';
import { Logo } from '@/components/svg';

export function SideNav(props: any) {
  const { pathname, renderUrl, websiteId } = useNavigation();
  const { user } = useLoginQuery();
  const readOnlyOperator = !!user?.isOperator && !user?.isAdmin;
  const [isCollapsed] = useGlobalState('sidenav-collapsed', false);
  const links = useMainNavItems();

  return (
    <Column
      {...props}
      backgroundColor="surface"
      border
      borderRadius
      padding="2"
      flexGrow="1"
      minHeight="0"
      margin="2"
      style={{
        width: isCollapsed ? '60px' : '240px',
        transition: 'width 0.2s ease-in-out',
        overflow: 'hidden',
      }}
    >
      <Row
        alignItems="center"
        justifyContent="space-between"
        minHeight="9"
        style={{ flexShrink: 0 }}
      >
        <Row
          padding="3"
          alignItems="center"
          justifyContent={isCollapsed ? 'center' : 'space-between'}
          flexGrow="1"
        >
          {!isCollapsed && (
            <IconLabel icon={<Logo />}>
              <Text weight="bold">{readOnlyOperator ? 'Stellog (Operator)' : 'Stellog'}</Text>
            </IconLabel>
          )}
          <PanelButton />
        </Row>
      </Row>
      <OverlayScrollArea
        showScrollIndicators
        className={isCollapsed ? styles.collapsed : undefined}
        style={{ flexGrow: 1, minHeight: 0 }}
      >
        {websiteId ? (
          <WebsiteNav websiteId={websiteId} isCollapsed={isCollapsed} />
        ) : pathname.includes('/settings') ? (
          <SettingsNav isCollapsed={isCollapsed} />
        ) : pathname.includes('/admin') && !readOnlyOperator ? (
          <AdminNav />
        ) : (
          <Column gap="2">
            {links.map(({ id, path, label, icon }) => {
              const href = renderUrl(path, false);
              const pathOnly = href.split('?')[0];
              const isSelected =
                id === 'settings'
                  ? pathname.includes('/settings')
                  : pathname === pathOnly || pathname.startsWith(`${pathOnly}/`);
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
                <Link key={id} href={href} role="button">
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
        )}
      </OverlayScrollArea>
      <Row
        paddingTop="2"
        width="100%"
        justifyContent={isCollapsed ? 'center' : undefined}
        style={{ flexShrink: 0 }}
      >
        <UserButton showText={!isCollapsed} />
      </Row>
    </Column>
  );
}

const PanelButton = (props: ButtonProps) => {
  const [isCollapsed, setIsCollapsed] = useGlobalState('sidenav-collapsed', false);
  return (
    <Button
      onPress={() => setIsCollapsed(!isCollapsed)}
      variant="zero"
      {...props}
      style={{ padding: 0 }}
    >
      <Icon strokeColor="muted">
        <PanelLeft />
      </Icon>
    </Button>
  );
};
