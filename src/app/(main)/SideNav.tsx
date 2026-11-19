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
import { ProjectNav } from '@/app/(main)/projects/[projectId]/ProjectNav';
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
import { isReadOnlyOperator, PROJECT_PATH } from '@/stellog/project-nav';

export function SideNav(props: any) {
  const { pathname, renderUrl, websiteId } = useNavigation();
  const [, projectId] = pathname.match(PROJECT_PATH) || [];
  const { user } = useLoginQuery();
  const readOnlyOperator = isReadOnlyOperator(user);
  const operatorShell = !!user?.isAdmin || readOnlyOperator;
  const [isCollapsed] = useGlobalState('sidenav-collapsed', false);
  const links = useMainNavItems();

  return (
    <Column
      {...props}
      className="stellog-rail"
      backgroundColor="surface"
      border
      borderRadius
      padding="2"
      flexGrow="1"
      minHeight="0"
      margin="2"
      style={{
        width: isCollapsed ? '60px' : operatorShell ? '280px' : '240px',
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
            <Row alignItems="center" gap="2" minWidth="0">
              <Icon>
                <Logo />
              </Icon>
              <Text whitespace="nowrap">
                <Text weight="bold">Stellog</Text>
                {operatorShell && <Text> (SCF Operator)</Text>}
              </Text>
            </Row>
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
        ) : projectId ? (
          <ProjectNav projectId={projectId} isCollapsed={isCollapsed} />
        ) : pathname.includes('/settings') ? (
          <SettingsNav isCollapsed={isCollapsed} />
        ) : operatorShell ? (
          <AdminNav isCollapsed={isCollapsed} />
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
                <Link
                  key={id}
                  href={href}
                  role="button"
                  className={isSelected ? 'stellog-nav-link is-selected' : 'stellog-nav-link'}
                >
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
