'use client';

import {
  Button,
  Column,
  DataColumn,
  DataTable,
  Grid,
  ListItem,
  Row,
  SearchField,
  Select,
  Text,
} from '@umami/react-zen';
import { useState } from 'react';
import { Empty } from '@/components/common/Empty';
import Link from '@/components/common/Link';
import { PageHeader } from '@/components/common/PageHeader';
import { Panel } from '@/components/common/Panel';
import { useApi, useDateRange, useLoginQuery, useNavigation } from '@/components/hooks';
import { DateFilter } from '@/components/input/DateFilter';
import { ChangeLabel } from '@/components/metrics/ChangeLabel';
import { limitSelection } from '@/stellog/operator-report';

type Project = {
  id: string;
  type: 'team' | 'website';
  name: string;
  status: 'active' | 'pending';
  properties: number;
  pendingProperties: number;
  websiteIds: string[];
  pageviews: number;
  visitors: number;
  requests: number;
  errors: number;
  errorRate: number;
  pageviewsGrowth: number | null;
  visitorsGrowth: number | null;
  requestsGrowth: number | null;
  pageviewsPrevious: number;
  visitorsPrevious: number;
  requestsPrevious: number;
  p50: number | null;
  p95: number | null;
  p50Capped: boolean;
  p95Capped: boolean;
};

const oneLine = { whiteSpace: 'nowrap' } as const;

const SORTS = [
  ['requests', 'API requests'],
  ['pageviews', 'Pageviews'],
  ['visitors', 'Visitors'],
  ['errors', 'API errors'],
  ['errorRate', 'Error rate'],
  ['p95', 'p95 latency'],
  ['pageviewsGrowth', 'Pageview trend'],
  ['visitorsGrowth', 'Visitor trend'],
  ['requestsGrowth', 'API request trend'],
  ['name', 'Name'],
] as const;

export function OperatorProjectsPage() {
  const { get, post, del, useQuery } = useApi();
  const { user } = useLoginQuery();
  const canManage = !!user?.isAdmin;
  const { dateRange } = useDateRange();
  const { router, query, updateParams } = useNavigation();
  const [selected, setSelected] = useState<string[]>([]);
  const [draft, setDraft] = useState(query.q || '');
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

  const projects = (projectsQuery.data?.projects ?? []).map((project, index) => ({
    ...project,
    rank: index + 1,
    websiteIds: project.websiteIds ?? [],
  }));
  const compared = selected
    .map(id => projects.find(project => project.id === id))
    .filter((project): project is (typeof projects)[number] => !!project);

  const setParam = (name: string, value: string) => {
    router.push(updateParams({ [name]: value }));
  };

  const toggle = (id: string) => {
    setSelected(current => limitSelection(current, id));
  };

  const reload = () => projectsQuery.refetch();

  return (
    <Column gap="6" margin="2">
      <PageHeader title="Projects">
        <DateFilter
          value={query.date || '24hour'}
          onChange={value => setParam('date', value)}
          showAllTime={false}
        />
      </PageHeader>
      <Panel>
        <Column gap="4">
          <Row gap="3" alignItems="center" wrap="wrap">
            <Select
              aria-label="Status"
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
            <SearchField
              value={draft}
              placeholder="Filter by name"
              onSearch={value => {
                setDraft(value);
                setParam('q', value);
              }}
            />
          </Row>
          {projectsQuery.isLoading && <Text>Loading projects.</Text>}
          {projectsQuery.error && <Text>Projects could not be loaded.</Text>}
          {projectsQuery.data && projects.length === 0 && <Empty />}
          {projects.length > 0 && (
            <div style={{ overflowX: 'auto' }}>
              <DataTable data={projects} style={{ minWidth: 1180 }}>
                <DataColumn id="compare" label=" " width="44px" style={oneLine}>
                  {(row: (typeof projects)[number]) => (
                    <input
                      type="checkbox"
                      aria-label={`Compare ${row.name}`}
                      checked={selected.includes(row.id)}
                      onChange={() => toggle(row.id)}
                    />
                  )}
                </DataColumn>
                <DataColumn id="rank" label="Rank" align="end" width="64px" style={oneLine}>
                  {(row: (typeof projects)[number]) => row.rank}
                </DataColumn>
                <DataColumn id="name" label="Project" width="minmax(148px, 1.5fr)" style={oneLine}>
                  {(row: (typeof projects)[number]) =>
                    row.websiteIds[0] ? (
                      <Link href={`/websites/${row.websiteIds[0]}`}>{row.name}</Link>
                    ) : (
                      <Text>{row.name}</Text>
                    )
                  }
                </DataColumn>
                <DataColumn
                  id="pageviews"
                  label="Pageviews"
                  align="end"
                  width="minmax(96px, 1fr)"
                  style={oneLine}
                >
                  {(row: (typeof projects)[number]) => row.pageviews.toLocaleString()}
                </DataColumn>
                <DataColumn
                  id="visitors"
                  label="Visitors"
                  align="end"
                  width="minmax(88px, 1fr)"
                  style={oneLine}
                >
                  {(row: (typeof projects)[number]) => row.visitors.toLocaleString()}
                </DataColumn>
                <DataColumn
                  id="requests"
                  label="API requests"
                  align="end"
                  width="minmax(118px, 1fr)"
                  style={oneLine}
                >
                  {(row: (typeof projects)[number]) => row.requests.toLocaleString()}
                </DataColumn>
                <DataColumn
                  id="errors"
                  label="Errors"
                  align="end"
                  width="minmax(80px, 1fr)"
                  style={oneLine}
                >
                  {(row: (typeof projects)[number]) => row.errors.toLocaleString()}
                </DataColumn>
                <DataColumn
                  id="errorRate"
                  label="Error rate"
                  align="end"
                  width="minmax(96px, 1fr)"
                  style={oneLine}
                >
                  {(row: (typeof projects)[number]) => formatRate(row.errorRate)}
                </DataColumn>
                <DataColumn
                  id="p50"
                  label="p50"
                  align="end"
                  width="minmax(72px, 0.8fr)"
                  style={oneLine}
                >
                  {(row: (typeof projects)[number]) => formatLatency(row.p50, row.p50Capped)}
                </DataColumn>
                <DataColumn
                  id="p95"
                  label="p95"
                  align="end"
                  width="minmax(72px, 0.8fr)"
                  style={oneLine}
                >
                  {(row: (typeof projects)[number]) => formatLatency(row.p95, row.p95Capped)}
                </DataColumn>
                <DataColumn
                  id="pageviewsGrowth"
                  label="Pageviews trend"
                  align="end"
                  width="minmax(132px, 1fr)"
                  style={oneLine}
                >
                  {(row: (typeof projects)[number]) => (
                    <Trend
                      value={row.pageviewsGrowth}
                      current={row.pageviews}
                      previous={row.pageviewsPrevious}
                    />
                  )}
                </DataColumn>
                <DataColumn
                  id="visitorsGrowth"
                  label="Visitors trend"
                  align="end"
                  width="minmax(124px, 1fr)"
                  style={oneLine}
                >
                  {(row: (typeof projects)[number]) => (
                    <Trend
                      value={row.visitorsGrowth}
                      current={row.visitors}
                      previous={row.visitorsPrevious}
                    />
                  )}
                </DataColumn>
                <DataColumn
                  id="requestsGrowth"
                  label="API trend"
                  align="end"
                  width="minmax(96px, 1fr)"
                  style={oneLine}
                >
                  {(row: (typeof projects)[number]) => (
                    <Trend
                      value={row.requestsGrowth}
                      current={row.requests}
                      previous={row.requestsPrevious}
                    />
                  )}
                </DataColumn>
                {canManage && (
                  <DataColumn id="action" label=" " align="end" width="160px">
                    {(row: (typeof projects)[number]) => (
                      <Row gap="2">
                        {row.status === 'pending' && (
                          <Button variant="quiet" onPress={() => act(post, row, 'approve', reload)}>
                            Approve
                          </Button>
                        )}
                        <Button variant="quiet" onPress={() => act(del, row, '', reload, true)}>
                          Remove
                        </Button>
                      </Row>
                    )}
                  </DataColumn>
                )}
              </DataTable>
            </div>
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
                <Metric label="Error rate" value={formatRate(project.errorRate)} />
                <Metric label="p50" value={formatLatency(project.p50, project.p50Capped)} />
                <Metric label="p95" value={formatLatency(project.p95, project.p95Capped)} />
                <Metric
                  label="Pageviews trend"
                  value={growthText(
                    project.pageviewsGrowth,
                    project.pageviews,
                    project.pageviewsPrevious,
                  )}
                />
                <Metric
                  label="Visitors trend"
                  value={growthText(
                    project.visitorsGrowth,
                    project.visitors,
                    project.visitorsPrevious,
                  )}
                />
                <Metric
                  label="API trend"
                  value={growthText(
                    project.requestsGrowth,
                    project.requests,
                    project.requestsPrevious,
                  )}
                />
              </Column>
            ))}
          </Grid>
        </Panel>
      )}
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

function Trend({
  value,
  current,
  previous,
}: {
  value: number | null;
  current: number;
  previous: number;
}) {
  if (previous === 0 && current > 0) return <Text>new</Text>;
  if (value === null) return <Text>—</Text>;
  const pct = Math.round(value * 100);
  return <ChangeLabel value={pct}>{`${pct > 0 ? '+' : ''}${pct}%`}</ChangeLabel>;
}

function growthText(value: number | null, current: number, previous: number) {
  if (previous === 0 && current > 0) return 'new';
  if (value === null) return '—';
  const pct = Math.round(value * 100);
  return `${pct > 0 ? '+' : ''}${pct}%`;
}

function formatRate(rate: number) {
  return `${Math.round(rate * 1000) / 10}%`;
}

function formatLatency(ms: number | null, capped: boolean) {
  if (capped) return '> 10s';
  if (ms === null) return '—';
  if (ms >= 1000) return `${ms / 1000}s`;
  return `${ms} ms`;
}
