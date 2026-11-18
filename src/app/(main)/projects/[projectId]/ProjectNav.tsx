'use client';

import { Column, Row, Text, Tooltip, TooltipTrigger } from '@umami/react-zen';
import { IconLabel } from '@/components/common/IconLabel';
import Link from '@/components/common/Link';
import { useLoginQuery, useMessages, useNavigation } from '@/components/hooks';
import { Activity, ArrowLeft, Globe, LayoutDashboard, Wrench } from '@/components/icons';
import { Network } from '@/components/svg';
import { buildPath } from '@/lib/url';
import { isReadOnlyOperator } from '@/stellog/project-nav';

export function ProjectNav({
  projectId,
  isCollapsed,
  onItemClick,
}: {
  projectId: string;
  isCollapsed?: boolean;
  onItemClick?: () => void;
}) {
  const { t, labels } = useMessages();
  const { pathname, query } = useNavigation();
  const { user } = useLoginQuery();
  const operatorShell = !!user?.isAdmin || isReadOnlyOperator(user);
  const base = `/projects/${projectId}`;
  const back = operatorShell ? '/admin/projects' : '/projects';
  const items = [
    { id: 'overview', label: 'Overview', path: base, icon: <LayoutDashboard /> },
    { id: 'websites', label: 'Websites', path: `${base}/websites`, icon: <Globe /> },
    { id: 'apis', label: 'APIs', path: `${base}/apis`, icon: <Activity /> },
    { id: 'ledger', label: 'Ledger', path: `${base}/ledger`, icon: <Network /> },
    { id: 'setup', label: 'Setup', path: `${base}/setup`, icon: <Wrench /> },
  ];
  const selected =
    items.find(item => item.id !== 'overview' && pathname.startsWith(item.path))?.id ?? 'overview';

  return (
    <Column gap="2" marginTop={isCollapsed ? '2' : undefined}>
      <Link href={buildPath(back, query)} role="button" onClick={onItemClick}>
        {isCollapsed ? (
          <TooltipTrigger delay={0}>
            <Row
              tabIndex={0}
              alignItems="center"
              justifyContent="center"
              hover={{ backgroundColor: 'surface-sunken' }}
              borderRadius
              minHeight="9"
            >
              <IconLabel icon={<ArrowLeft />} label="" padding />
            </Row>
            <Tooltip placement="right">{t(labels.back)}</Tooltip>
          </TooltipTrigger>
        ) : (
          <Row
            alignItems="center"
            hover={{ backgroundColor: 'surface-sunken' }}
            borderRadius
            minHeight="9"
          >
            <IconLabel icon={<ArrowLeft />} label={t(labels.back)} padding />
          </Row>
        )}
      </Link>
      <Column gap="1" marginBottom="1">
        {!isCollapsed && (
          <Row paddingX="3" marginTop="2">
            <Text weight="bold">Project</Text>
          </Row>
        )}
        {items.map(({ id, path, label, icon }) => {
          const isSelected = selected === id;
          return (
            <Link key={id} href={buildPath(path, query)} role="button" onClick={onItemClick}>
              {isCollapsed ? (
                <TooltipTrigger delay={0}>
                  <Row
                    tabIndex={0}
                    alignItems="center"
                    justifyContent="center"
                    hover={{ backgroundColor: 'surface-sunken' }}
                    backgroundColor={isSelected ? 'surface-sunken' : undefined}
                    borderRadius
                    minHeight="9"
                  >
                    <IconLabel
                      icon={icon}
                      label=""
                      weight={isSelected ? 'bold' : undefined}
                      padding
                    />
                  </Row>
                  <Tooltip placement="right">{label}</Tooltip>
                </TooltipTrigger>
              ) : (
                <Row
                  alignItems="center"
                  hover={{ backgroundColor: 'surface-sunken' }}
                  backgroundColor={isSelected ? 'surface-sunken' : undefined}
                  borderRadius
                  minHeight="9"
                >
                  <IconLabel
                    icon={icon}
                    label={label}
                    weight={isSelected ? 'bold' : undefined}
                    padding
                  />
                </Row>
              )}
            </Link>
          );
        })}
      </Column>
    </Column>
  );
}
