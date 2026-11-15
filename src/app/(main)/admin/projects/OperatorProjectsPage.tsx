'use client';

import { Button, Column, Grid, ListItem, Row, Select, Text, TextField } from '@umami/react-zen';
import { type ReactNode, useState } from 'react';
import { PageHeader } from '@/components/common/PageHeader';
import { Panel } from '@/components/common/Panel';
import { useApi, useDateRange, useNavigation } from '@/components/hooks';
import { DateFilter } from '@/components/input/DateFilter';

type Project = {
  id: string;
  type: 'team' | 'website';
  name: string;
  status: 'active' | 'pending';
  properties: number;
  pendingProperties: number;
  pageviews: number;
  visitors: number;
  requests: number;
  errors: number;
  errorRate: number;
  p50: number | null;
  p95: number | null;
  p50Capped: boolean;
  p95Capped: boolean;
};

type KeyRow = {
  id: string;
  name: string;
  keyPrefix: string;
  revokedAt: string | null;
};

const SORTS = [
  ['requests', 'API requests'],
  ['pageviews', 'Pageviews'],
  ['visitors', 'Visitors'],
  ['errors', 'API errors'],
  ['p95', 'p95 latency'],
  ['name', 'Name'],
] as const;

export function OperatorProjectsPage() {
  const { get, post, put, del, useQuery } = useApi();
  const { dateRange } = useDateRange();
  const { router, query, updateParams } = useNavigation();
  const [selected, setSelected] = useState<string[]>([]);
  const [draft, setDraft] = useState(query.q || '');
  const [keyName, setKeyName] = useState('');
  const [createdToken, setCreatedToken] = useState('');
  const startAt = dateRange.startDate.getTime();
  const endAt = dateRange.endDate.getTime();
  const status = query.status || 'active';
  const sort = query.sort || 'requests';
  const order = query.order || 'desc';

  const projectsQuery = useQuery({
    queryKey: ['operator-projects', startAt, endAt, query.q || '', status, sort, order],
    queryFn: () =>
      get('/admin/projects', {
        startAt,
        endAt,
        unit: dateRange.unit,
        q: query.q || undefined,
        status,
        sort,
        order,
      }) as Promise<{ enrollmentMode: 'open' | 'approval-required'; projects: Project[] }>,
  });
  const keysQuery = useQuery({
    queryKey: ['operator-keys'],
    queryFn: () => get('/admin/operator-keys') as Promise<{ keys: KeyRow[] }>,
  });

  const projects = projectsQuery.data?.projects ?? [];
  const compared = selected
    .map(id => projects.find(project => project.id === id))
    .filter((project): project is Project => !!project);

  const setParam = (name: string, value: string) => {
    router.push(updateParams({ [name]: value }));
  };

  const toggle = (id: string) => {
    setSelected(current => {
      if (current.includes(id)) return current.filter(item => item !== id);
      if (current.length >= 4) return current;
      return [...current, id];
    });
  };

  const reload = () => projectsQuery.refetch();

  return (
    <Column gap="6" margin="2">
      <PageHeader title="Projects" />
      <Panel>
        <Column gap="3">
          <Row gap="3" alignItems="center">
            <DateFilter
              value={query.date || '24hour'}
              onChange={value => setParam('date', value)}
              showAllTime={false}
            />
            <Select
              aria-label="Enrollment"
              value={status}
              onChange={value => setParam('status', String(value))}
            >
              <ListItem id="active">Active</ListItem>
              <ListItem id="pending">Pending</ListItem>
              <ListItem id="all">All</ListItem>
            </Select>
            <Select
              aria-label="Sort"
              value={sort}
              onChange={value => setParam('sort', String(value))}
            >
              {SORTS.map(([id, label]) => (
                <ListItem id={id} key={id}>
                  {label}
                </ListItem>
              ))}
            </Select>
            <Select
              aria-label="Order"
              value={order}
              onChange={value => setParam('order', String(value))}
            >
              <ListItem id="desc">Descending</ListItem>
              <ListItem id="asc">Ascending</ListItem>
            </Select>
            <Row gap="2">
              <TextField
                aria-label="Filter by name"
                value={draft}
                placeholder="Filter by name"
                onChange={setDraft}
              />
              <Button variant="outline" onPress={() => setParam('q', draft)}>
                Filter
              </Button>
            </Row>
          </Row>
          <Row gap="3" alignItems="center">
            <Text>Enrollment</Text>
            <Select
              aria-label="Enrollment mode"
              value={projectsQuery.data?.enrollmentMode || 'open'}
              onChange={async value => {
                await put('/admin/enrollment', { mode: value });
                reload();
              }}
            >
              <ListItem id="open">Open</ListItem>
              <ListItem id="approval-required">Approval required</ListItem>
            </Select>
          </Row>
          {projectsQuery.isLoading && <Text>Loading projects.</Text>}
          {projectsQuery.error && <Text>Projects could not be loaded.</Text>}
          {projectsQuery.data && (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <Th>{''}</Th>
                  <Th>Project</Th>
                  <Th align="right">Pageviews</Th>
                  <Th align="right">Visitors</Th>
                  <Th align="right">API requests</Th>
                  <Th align="right">Errors</Th>
                  <Th align="right">p50</Th>
                  <Th align="right">p95</Th>
                  <Th>{''}</Th>
                </tr>
              </thead>
              <tbody>
                {projects.length === 0 && (
                  <tr>
                    <Td colSpan={9}>No projects in this range.</Td>
                  </tr>
                )}
                {projects.map(project => (
                  <tr key={project.id}>
                    <Td>
                      <input
                        type="checkbox"
                        aria-label={`Compare ${project.name}`}
                        checked={selected.includes(project.id)}
                        onChange={() => toggle(project.id)}
                      />
                    </Td>
                    <Td>
                      {project.name}
                      <Text color="muted">
                        {`${project.type === 'team' ? 'Team' : 'Website'} · ${project.properties} properties`}
                        {project.pendingProperties > 0
                          ? ` · ${project.pendingProperties} pending`
                          : ''}
                        {project.status === 'pending' ? ' · pending' : ''}
                      </Text>
                    </Td>
                    <Td align="right">{project.pageviews.toLocaleString()}</Td>
                    <Td align="right">{project.visitors.toLocaleString()}</Td>
                    <Td align="right">{project.requests.toLocaleString()}</Td>
                    <Td align="right">{project.errors.toLocaleString()}</Td>
                    <Td align="right">{formatLatency(project.p50, project.p50Capped)}</Td>
                    <Td align="right">{formatLatency(project.p95, project.p95Capped)}</Td>
                    <Td>
                      <Row gap="2">
                        {project.status === 'pending' && (
                          <Button
                            variant="quiet"
                            onPress={() => act(post, project, 'approve', reload)}
                          >
                            Approve
                          </Button>
                        )}
                        <Button variant="quiet" onPress={() => act(del, project, '', reload, true)}>
                          Remove
                        </Button>
                      </Row>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Column>
      </Panel>
      {compared.length >= 2 && (
        <Panel title="Side by side">
          <Grid columns={{ base: '1fr', md: `repeat(${Math.min(compared.length, 4)}, 1fr)` }} gap>
            {compared.map(project => (
              <Column key={project.id} gap="2">
                <Text weight="bold">{project.name}</Text>
                <Metric label="Pageviews" value={project.pageviews.toLocaleString()} />
                <Metric label="Visitors" value={project.visitors.toLocaleString()} />
                <Metric label="API requests" value={project.requests.toLocaleString()} />
                <Metric label="API errors" value={project.errors.toLocaleString()} />
                <Metric label="p50" value={formatLatency(project.p50, project.p50Capped)} />
                <Metric label="p95" value={formatLatency(project.p95, project.p95Capped)} />
              </Column>
            ))}
          </Grid>
        </Panel>
      )}
      <Panel title="Operator keys">
        <Column gap="3">
          <Text>
            A key can read project metrics. It cannot change enrollment or remove a project.
          </Text>
          <Row gap="2">
            <TextField
              aria-label="Key name"
              value={keyName}
              placeholder="Key name"
              onChange={setKeyName}
            />
            <Button
              variant="primary"
              isDisabled={!keyName.trim()}
              onPress={async () => {
                const created = (await post('/admin/operator-keys', { name: keyName.trim() })) as {
                  token: string;
                };
                setCreatedToken(created.token);
                setKeyName('');
                keysQuery.refetch();
              }}
            >
              Create key
            </Button>
          </Row>
          {createdToken && (
            <Column gap="1">
              <Text>Copy this key now. It is stored only as a hash.</Text>
              <TextField aria-label="New operator key" value={createdToken} isReadOnly allowCopy />
            </Column>
          )}
          {keysQuery.data?.keys.map(key => (
            <Row key={key.id} justifyContent="space-between" alignItems="center">
              <Text>
                {key.name} · {key.keyPrefix} · {key.revokedAt ? 'revoked' : 'active'}
              </Text>
              {!key.revokedAt && (
                <Button
                  variant="quiet"
                  onPress={async () => {
                    await del(`/admin/operator-keys/${key.id}`);
                    keysQuery.refetch();
                  }}
                >
                  Revoke
                </Button>
              )}
            </Row>
          ))}
        </Column>
      </Panel>
    </Column>
  );
}

async function act(
  method: (url: string) => Promise<unknown>,
  project: Project,
  action: 'approve' | '',
  reload: () => void,
  confirmRemove = false,
) {
  if (confirmRemove && !window.confirm(`Remove ${project.name}?`)) return;
  const [, type, id] = project.id.match(/^(team|website):(.+)$/) || [];
  const suffix = action ? `/${action}` : '';
  await method(`/admin/projects/${type}/${id}${suffix}`);
  reload();
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <Row justifyContent="space-between">
      <Text color="muted">{label}</Text>
      <Text>{value}</Text>
    </Row>
  );
}

function formatLatency(ms: number | null, capped: boolean) {
  if (capped) return '> 10s';
  if (ms === null) return '—';
  if (ms >= 1000) return `${ms / 1000}s`;
  return `${ms} ms`;
}

function Th({ children, align = 'left' }: { children: string; align?: 'left' | 'right' }) {
  return (
    <th style={{ textAlign: align, padding: '8px', borderBottom: '1px solid var(--border-color)' }}>
      {children}
    </th>
  );
}

function Td({
  children,
  align = 'left',
  colSpan,
}: {
  children: ReactNode;
  align?: 'left' | 'right';
  colSpan?: number;
}) {
  return (
    <td
      colSpan={colSpan}
      style={{ textAlign: align, padding: '8px', borderBottom: '1px solid var(--border-color)' }}
    >
      {children}
    </td>
  );
}
