'use client';

import {
  Button,
  Column,
  DataColumn,
  DataTable,
  Dialog,
  DialogTrigger,
  Grid,
  Icon,
  ListItem,
  Modal,
  Row,
  SearchField,
  Select,
  Text,
} from '@umami/react-zen';
import { useState } from 'react';
import { EmptyCard } from '@/components/common/EmptyPlaceholder';
import { Favicon } from '@/components/common/Favicon';
import Link from '@/components/common/Link';
import { PageHeader } from '@/components/common/PageHeader';
import { Panel } from '@/components/common/Panel';
import { useApi, useLoginQuery, useNavigation } from '@/components/hooks';
import { Ellipsis } from '@/components/icons';
import { AiSummaryButton } from '@/components/input/AiSummaryButton';
import { DateFilter } from '@/components/input/DateFilter';
import { ChangeLabel } from '@/components/metrics/ChangeLabel';
import { parseDateRange } from '@/lib/date';
import {
  limitSelection,
  parseProjectId,
  propertyLabel,
  showLatency,
} from '@/stellog/operator-report';

type Project = {
  id: string;
  type: 'team' | 'website';
  name: string;
  status: 'active' | 'pending';
  properties: number;
  pendingProperties: number;
  sites: number;
  apis: number;
  websiteIds: string[];
  domain: string | null;
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

type TrendKey = 'pageviews' | 'visitors' | 'requests';

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
  const { router, query, updateParams } = useNavigation();
  const [selected, setSelected] = useState<string[]>([]);
  const [draft, setDraft] = useState(query.q || '');
  const dateValue = `${query.date || '30day'}`;
  const parsed = parseDateRange(dateValue) ?? parseDateRange('30day');
  const startAt = parsed?.startDate.getTime() ?? Date.now() - 30 * 24 * 60 * 60 * 1000;
  const endAt = parsed?.endDate.getTime() ?? Date.now();
  const status = query.status === 'pending' || query.status === 'all' ? query.status : 'active';
  const sort = SORTS.some(([id]) => id === query.sort) ? query.sort : 'requests';
  const order = query.order === 'asc' ? 'asc' : 'desc';
  const units: readonly string[] = ['minute', 'hour', 'day', 'week', 'month', 'year'];
  const unit = parsed?.unit && units.includes(parsed.unit) ? parsed.unit : 'day';
  const q = `${query.q || ''}`.trim().slice(0, 100);
  const trend: TrendKey =
    query.trend === 'pageviews' || query.trend === 'visitors' ? query.trend : 'requests';

  const projectsQuery = useQuery({
    queryKey: ['operator-projects', startAt, endAt, q, status, sort, order, unit],
    queryFn: () =>
      get('/admin/projects', {
        startAt,
        endAt,
        unit,
        q: q || undefined,
        status,
        sort,
        order,
      }) as Promise<{ enrollmentMode: 'open' | 'approval-required'; projects: Project[] }>,
  });

  const projects = (projectsQuery.data?.projects ?? []).map((project, index) => ({
    ...project,
    rank: index + 1,
    sites: project.sites ?? 0,
    apis: project.apis ?? 0,
    websiteIds: project.websiteIds ?? [],
  }));
  const latency = showLatency(projects);
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
        <Row gap="3" alignItems="center">
          <DateFilter
            value={dateValue}
            onChange={value => setParam('date', value)}
            showAllTime={false}
          />
          <AiSummaryButton scope="projects" />
        </Row>
      </PageHeader>
      <Panel>
        <Column gap="4">
          <Row alignItems="center" gap="3" wrap="nowrap">
            <div style={{ width: '100%', maxWidth: '28rem', flex: '1 1 16rem' }}>
              <SearchField
                value={draft}
                placeholder="Search"
                style={{ width: '100%' }}
                onSearch={value => {
                  setDraft(value);
                  setParam('q', value);
                }}
              />
            </div>
            <Row alignItems="center" gap="3" wrap="nowrap" style={{ marginLeft: 'auto' }}>
              <Select
                aria-label="Status"
                value={status}
                renderValue={() =>
                  status === 'pending' ? 'Pending' : status === 'all' ? 'All' : 'Active'
                }
                onChange={value => setParam('status', String(value))}
              >
                <ListItem id="active">Active</ListItem>
                <ListItem id="pending">Pending</ListItem>
                <ListItem id="all">All</ListItem>
              </Select>
              <Select
                aria-label="Sort"
                value={sort}
                renderValue={() => SORTS.find(([id]) => id === sort)?.[1] ?? 'API requests'}
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
                renderValue={() => (order === 'asc' ? 'Ascending' : 'Descending')}
                onChange={value => setParam('order', String(value))}
              >
                <ListItem id="desc">Descending</ListItem>
                <ListItem id="asc">Ascending</ListItem>
              </Select>
              <Select
                aria-label="Trend"
                value={trend}
                renderValue={() =>
                  trend === 'pageviews'
                    ? 'Pageview trend'
                    : trend === 'visitors'
                      ? 'Visitor trend'
                      : 'API trend'
                }
                onChange={value => setParam('trend', String(value))}
              >
                <ListItem id="requests">API trend</ListItem>
                <ListItem id="pageviews">Pageview trend</ListItem>
                <ListItem id="visitors">Visitor trend</ListItem>
              </Select>
            </Row>
          </Row>
          {projectsQuery.isLoading && <Text>Loading projects.</Text>}
          {projectsQuery.error && <Text>Projects could not be loaded.</Text>}
          {projectsQuery.data && projects.length === 0 && (
            <EmptyCard title="No projects" description="No projects match this range." />
          )}
          {projects.length > 0 && (
            <div style={{ overflowX: 'auto' }}>
              <DataTable data={projects} style={{ minWidth: latency ? 1180 : 980 }}>
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
                  {(row: (typeof projects)[number]) => (
                    <Row gap="2" alignItems="center">
                      <Favicon domain={row.domain} />
                      {projectPath(row) ? (
                        <Link href={projectPath(row)}>{row.name}</Link>
                      ) : (
                        <Text>{row.name}</Text>
                      )}
                    </Row>
                  )}
                </DataColumn>
                <DataColumn
                  id="properties"
                  label="Properties"
                  width="minmax(120px, 1fr)"
                  style={oneLine}
                >
                  {(row: (typeof projects)[number]) => propertyLabel(row.sites, row.apis)}
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
                {latency && (
                  <DataColumn
                    id="p50"
                    label="p50"
                    align="end"
                    width="minmax(72px, 0.8fr)"
                    style={oneLine}
                  >
                    {(row: (typeof projects)[number]) => formatLatency(row.p50, row.p50Capped)}
                  </DataColumn>
                )}
                {latency && (
                  <DataColumn
                    id="p95"
                    label="p95"
                    align="end"
                    width="minmax(72px, 0.8fr)"
                    style={oneLine}
                  >
                    {(row: (typeof projects)[number]) => formatLatency(row.p95, row.p95Capped)}
                  </DataColumn>
                )}
                <DataColumn
                  id="trend"
                  label="Trend"
                  align="end"
                  width="minmax(96px, 1fr)"
                  style={oneLine}
                >
                  {(row: (typeof projects)[number]) => {
                    const numbers = trendNumbers(row, trend);
                    return (
                      <Trend
                        value={numbers.value}
                        current={numbers.current}
                        previous={numbers.previous}
                      />
                    );
                  }}
                </DataColumn>
                {canManage && (
                  <DataColumn id="action" label=" " align="end" width="48px">
                    {(row: (typeof projects)[number]) => (
                      <DialogTrigger>
                        <Button variant="quiet" aria-label={`Actions for ${row.name}`}>
                          <Icon>
                            <Ellipsis />
                          </Icon>
                        </Button>
                        <Modal>
                          <Dialog title={row.name} style={{ width: 400 }}>
                            {({ close }) => (
                              <Column gap="4">
                                <Text>
                                  {row.status === 'pending'
                                    ? 'Approve this project, or remove it from the ranking.'
                                    : 'Remove this project from the ranking.'}
                                </Text>
                                <Row justifyContent="flex-end" gap="2">
                                  <Button onPress={close}>Cancel</Button>
                                  {row.status === 'pending' && (
                                    <Button
                                      variant="primary"
                                      onPress={() => {
                                        close();
                                        act(post, row, 'approve', reload);
                                      }}
                                    >
                                      Approve
                                    </Button>
                                  )}
                                  <Button
                                    variant="danger"
                                    onPress={() => {
                                      close();
                                      act(del, row, '', reload);
                                    }}
                                  >
                                    Remove
                                  </Button>
                                </Row>
                              </Column>
                            )}
                          </Dialog>
                        </Modal>
                      </DialogTrigger>
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
                <Metric label="Properties" value={propertyLabel(project.sites, project.apis)} />
                <Metric label="Pageviews" value={project.pageviews.toLocaleString()} />
                <Metric label="Visitors" value={project.visitors.toLocaleString()} />
                <Metric label="API requests" value={project.requests.toLocaleString()} />
                <Metric label="Error rate" value={formatRate(project.errorRate)} />
                {latency && (
                  <Metric label="p50" value={formatLatency(project.p50, project.p50Capped)} />
                )}
                {latency && (
                  <Metric label="p95" value={formatLatency(project.p95, project.p95Capped)} />
                )}
                <Metric
                  label="Trend"
                  value={growthText(
                    trendNumbers(project, trend).value,
                    trendNumbers(project, trend).current,
                    trendNumbers(project, trend).previous,
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
) {
  const [, type, id] = project.id.match(/^(team|website):(.+)$/) || [];
  const suffix = action ? `/${action}` : '';
  await method(`/admin/projects/${type}/${id}${suffix}`);
  reload();
}

function trendNumbers(
  row: {
    pageviews: number;
    visitors: number;
    requests: number;
    pageviewsGrowth: number | null;
    visitorsGrowth: number | null;
    requestsGrowth: number | null;
    pageviewsPrevious: number;
    visitorsPrevious: number;
    requestsPrevious: number;
  },
  trend: TrendKey,
) {
  if (trend === 'pageviews') {
    return {
      value: row.pageviewsGrowth,
      current: row.pageviews,
      previous: row.pageviewsPrevious,
    };
  }
  if (trend === 'visitors') {
    return {
      value: row.visitorsGrowth,
      current: row.visitors,
      previous: row.visitorsPrevious,
    };
  }
  return {
    value: row.requestsGrowth,
    current: row.requests,
    previous: row.requestsPrevious,
  };
}

function projectPath(row: { id: string; websiteIds: string[] }) {
  const parsed = parseProjectId(row.id);
  if (parsed?.type === 'team') return `/projects/${parsed.id}`;
  if (row.websiteIds[0]) return `/websites/${row.websiteIds[0]}`;
  return '';
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
