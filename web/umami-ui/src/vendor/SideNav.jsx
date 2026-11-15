// Adapted from umami SideNav.tsx and UserButton.tsx (MIT).
import { useRef, useState } from 'react';
import {
  Button,
  Column,
  Icon,
  Menu,
  MenuItem,
  MenuSeparator,
  MenuTrigger,
  Popover,
  Row,
  SubmenuTrigger,
  Text,
  Tooltip,
  TooltipTrigger,
  useTheme,
} from '@umami/react-zen';
import { accountLabel, api } from '../api.js';
import { Logo } from './Logo.jsx';

const svg = (paths) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{paths}</svg>
);

const icons = {
  dashboard: svg(<><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18"/></>),
  boards: svg(<><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></>),
  websites: svg(<><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></>),
  links: svg(<><path d="M10 13a5 5 0 0 0 7.5.5l2-2a5 5 0 0 0-7-7l-1.2 1.2"/><path d="M14 11a5 5 0 0 0-7.5-.5l-2 2a5 5 0 0 0 7 7l1.2-1.2"/></>),
  pixels: svg(<><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>),
  api: svg(<path d="M8 8l-4 4 4 4M16 8l4 4-4 4"/>),
  user: svg(<><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></>),
  settings: svg(<><circle cx="12" cy="12" r="3"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></>),
  globe: svg(<><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></>),
  theme: svg(<><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2"/></>),
  sun: svg(<><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></>),
  moon: svg(<path d="M21 14.5A8.5 8.5 0 1 1 9.5 3 7 7 0 0 0 21 14.5z"/>),
  book: svg(<><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></>),
  support: svg(<><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/><path d="M4.9 4.9l3.2 3.2M15.9 15.9l3.2 3.2M19.1 4.9l-3.2 3.2M8.1 15.9l-3.2 3.2"/></>),
  logout: svg(<><path d="M9 6H5a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h4"/><path d="M16 16l4-4-4-4M9 12h11"/></>),
  external: svg(<><path d="M14 4h6v6"/><path d="M10 14L20 4"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></>),
};

function Item({ icon, label, selected, collapsed, onPress }) {
  const row = (
    <Row
      as="button"
      onClick={onPress}
      alignItems="center"
      justifyContent={collapsed ? 'center' : undefined}
      hover={{ backgroundColor: 'surface-sunken' }}
      backgroundColor={selected ? 'surface-sunken' : undefined}
      borderRadius
      minHeight="9"
      style={{ border: 0, cursor: 'pointer', width: '100%', color: 'inherit', textAlign: 'left' }}
    >
      <Row alignItems="center" gap padding>
        <Icon>{icon}</Icon>
        {!collapsed && <Text weight={selected ? 'bold' : undefined}>{label}</Text>}
      </Row>
    </Row>
  );
  if (!collapsed) return row;
  return (
    <TooltipTrigger delay={0}>
      {row}
      <Tooltip placement="right">{label}</Tooltip>
    </TooltipTrigger>
  );
}

function UserButton({ user, collapsed, onSettings }) {
  const theme = useTheme((s) => s.theme);
  const setTheme = useTheme((s) => s.setTheme);
  const opened = useRef(0);
  const name = accountLabel(user);
  const act = (fn) => () => {
    if (performance.now() - opened.current < 300) return;
    fn();
  };
  const logout = async () => {
    await api('/auth/logout', { method: 'POST', body: '{}' });
    location.href = '/';
  };
  const trigger = (
    <Button variant="quiet" aria-label={collapsed ? name : undefined} style={{ padding: 0, width: '100%', justifyContent: 'flex-start' }}>
      <Row alignItems="center" width="100%" hover={{ backgroundColor: 'surface-sunken' }} borderRadius minHeight="10" style={{ overflow: 'hidden' }}>
        <Row alignItems="center" gap padding>
          <Icon>{icons.user}</Icon>
          {!collapsed && <Text truncate>{name}</Text>}
        </Row>
      </Row>
    </Button>
  );
  const menu = (
    <MenuTrigger onOpenChange={(open) => { if (open) opened.current = performance.now(); }}>
      {trigger}
      <Popover side="top" align="start">
        <Column minWidth="200px">
          <Menu>
            <MenuItem id="settings" onAction={act(onSettings)}>
              <Row alignItems="center" gap><Icon>{icons.settings}</Icon><Text>Settings</Text></Row>
            </MenuItem>
            <SubmenuTrigger>
              <MenuItem id="language" showSubMenuIcon>
                <Row alignItems="center" gap><Icon>{icons.globe}</Icon><Text>Language</Text></Row>
              </MenuItem>
              <Popover side="right" align="end" isNonModal>
                <Menu selectionMode="single" selectedKeys={new Set(['en'])}>
                  <MenuItem id="en"><Text weight="bold">English</Text></MenuItem>
                </Menu>
              </Popover>
            </SubmenuTrigger>
            <SubmenuTrigger>
              <MenuItem id="theme" showSubMenuIcon>
                <Row alignItems="center" gap><Icon>{icons.theme}</Icon><Text>Theme</Text></Row>
              </MenuItem>
              <Popover side="right" align="end" isNonModal>
                <Menu selectionMode="single" selectedKeys={new Set([theme])}>
                  <MenuItem id="light" onAction={act(() => setTheme('light'))}>
                    <Icon>{icons.sun}</Icon><Text weight={theme === 'light' ? 'bold' : undefined}>Light</Text>
                  </MenuItem>
                  <MenuItem id="dark" onAction={act(() => setTheme('dark'))}>
                    <Icon>{icons.moon}</Icon><Text weight={theme === 'dark' ? 'bold' : undefined}>Dark</Text>
                  </MenuItem>
                </Menu>
              </Popover>
            </SubmenuTrigger>
            <MenuItem id="docs" onAction={act(() => window.open('/docs', '_blank'))}>
              <Row alignItems="center" gap><Icon>{icons.book}</Icon><Text>Documentation</Text><Icon color="muted" size="sm">{icons.external}</Icon></Row>
            </MenuItem>
            <MenuItem id="support" onAction={act(() => window.open('https://github.com/klarqqs/starlog', '_blank'))}>
              <Row alignItems="center" gap><Icon>{icons.support}</Icon><Text>Support</Text></Row>
            </MenuItem>
            <MenuSeparator />
            <MenuItem id="logout" onAction={act(logout)}>
              <Row alignItems="center" gap><Icon>{icons.logout}</Icon><Text>Logout</Text></Row>
            </MenuItem>
          </Menu>
        </Column>
      </Popover>
    </MenuTrigger>
  );
  if (!collapsed) return <div style={{ width: '100%' }}>{menu}</div>;
  return (
    <TooltipTrigger delay={0}>
      <div style={{ width: '100%' }}>{menu}</div>
      <Tooltip placement="right">{name}</Tooltip>
    </TooltipTrigger>
  );
}

export function SideNav({ user, items, active, onSelect }) {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <Column
      backgroundColor="surface"
      border
      borderRadius
      padding="2"
      margin="2"
      style={{ width: collapsed ? 60 : 240, height: 'calc(100vh - 16px)', transition: 'width 0.2s ease-in-out', overflow: 'hidden', flexShrink: 0 }}
    >
      <Row alignItems="center" justifyContent="space-between" minHeight="9" style={{ flexShrink: 0 }}>
        <Row padding="3" alignItems="center" justifyContent={collapsed ? 'center' : 'space-between'} flexGrow="1">
          {!collapsed && (
            <Row alignItems="center" gap="2">
              <Icon><Logo /></Icon>
              <Text weight="bold">Stellog</Text>
            </Row>
          )}
          <Button onPress={() => setCollapsed((v) => !v)} variant="quiet" style={{ padding: 0 }}>
            <Icon strokeColor="muted">{icons.dashboard}</Icon>
          </Button>
        </Row>
      </Row>
      <Column gap="2" flexGrow="1" style={{ overflow: 'auto', minHeight: 0 }}>
        {items.map((item) => (
          <Item key={item.id} icon={icons[item.icon] || icons.dashboard} label={item.label} selected={item.id === active} collapsed={collapsed} onPress={() => onSelect(item.id)} />
        ))}
      </Column>
      <Row paddingTop="2" width="100%" justifyContent={collapsed ? 'center' : undefined} style={{ flexShrink: 0 }}>
        <UserButton user={user} collapsed={collapsed} onSettings={() => onSelect('settings')} />
      </Row>
    </Column>
  );
}
