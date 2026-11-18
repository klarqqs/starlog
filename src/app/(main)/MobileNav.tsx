import { Column, Grid, Row, Text } from '@umami/react-zen';
import { ProjectNav } from '@/app/(main)/projects/[projectId]/ProjectNav';
import { WebsiteNav } from '@/app/(main)/websites/[websiteId]/WebsiteNav';
import { IconLabel } from '@/components/common/IconLabel';
import Link from '@/components/common/Link';
import { useLoginQuery, useMainNavItems, useNavigation } from '@/components/hooks';
import { MobileMenuButton } from '@/components/input/MobileMenuButton';
import { UserButton } from '@/components/input/UserButton';
import { Logo } from '@/components/svg';
import { isReadOnlyOperator, PROJECT_PATH } from '@/stellog/project-nav';
import { AdminNav } from './admin/AdminNav';
import { SettingsNav } from './settings/SettingsNav';

export function MobileNav() {
  const { pathname, websiteId, renderUrl } = useNavigation();
  const [, projectId] = pathname.match(PROJECT_PATH) || [];
  const { user } = useLoginQuery();
  const readOnlyOperator = isReadOnlyOperator(user);
  const operatorShell = !!user?.isAdmin || readOnlyOperator;
  const isSettings = pathname.includes('/settings');
  const isMain = !websiteId && !projectId && !operatorShell && !isSettings;
  const links = useMainNavItems();

  return (
    <Grid columns="auto 1fr" flexGrow={1} backgroundColor="surface-sunken" borderRadius>
      <MobileMenuButton>
        {({ close }) => {
          return (
            <Column gap="2" display="flex" flex-direction="column" padding="1" height="100%">
              {isMain &&
                links.map(link => {
                  return (
                    <Row key={link.id} padding>
                      <Link href={renderUrl(link.path)} onClick={close}>
                        <IconLabel icon={link.icon} label={link.label} />
                      </Link>
                    </Row>
                  );
                })}
              {websiteId && <WebsiteNav websiteId={websiteId} onItemClick={close} />}
              {projectId && !websiteId && <ProjectNav projectId={projectId} onItemClick={close} />}
              {operatorShell && !websiteId && !projectId && !isSettings && (
                <AdminNav onItemClick={close} />
              )}
              {isSettings && <SettingsNav onItemClick={close} />}
              <Row style={{ marginTop: 'auto' }}>
                <UserButton onClose={close} />
              </Row>
            </Column>
          );
        }}
      </MobileMenuButton>
      <Row alignItems="center" justifyContent="center" flexGrow={1}>
        <IconLabel icon={<Logo />} style={{ width: 'auto' }}>
          <Text weight="bold">Stellog</Text>
          {operatorShell && <Text> (SCF Operator)</Text>}
        </IconLabel>
      </Row>
    </Grid>
  );
}
