import { Column, Grid, Row, Text } from '@umami/react-zen';
import { WebsiteNav } from '@/app/(main)/websites/[websiteId]/WebsiteNav';
import { IconLabel } from '@/components/common/IconLabel';
import Link from '@/components/common/Link';
import { useLoginQuery, useMainNavItems, useNavigation } from '@/components/hooks';
import { MobileMenuButton } from '@/components/input/MobileMenuButton';
import { UserButton } from '@/components/input/UserButton';
import { Logo } from '@/components/svg';
import { isReadOnlyOperator } from '@/stellog/project-nav';
import { AdminNav } from './admin/AdminNav';
import { SettingsNav } from './settings/SettingsNav';

export function MobileNav() {
  const { pathname, websiteId, renderUrl } = useNavigation();
  const { user } = useLoginQuery();
  const isAdmin = pathname.includes('/admin') && !isReadOnlyOperator(user);
  const isSettings = pathname.includes('/settings');
  const isMain = !websiteId && !isAdmin && !isSettings;
  const links = useMainNavItems();
  const readOnlyOperator = isReadOnlyOperator(user);

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
              {isAdmin && <AdminNav onItemClick={close} />}
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
          <Text weight="bold">{readOnlyOperator ? 'Stellog (Operator)' : 'Stellog'}</Text>
        </IconLabel>
      </Row>
    </Grid>
  );
}
