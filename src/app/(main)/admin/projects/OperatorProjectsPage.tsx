'use client';

import { Button, Column, Dialog, DialogTrigger, Icon, Modal, Row, SearchField, Text } from '@umami/react-zen';
import { useEffect, useState } from 'react';
import { EmptyCard } from '@/components/common/EmptyPlaceholder';
import { Favicon } from '@/components/common/Favicon';
import { PageHeader } from '@/components/common/PageHeader';
import { Panel } from '@/components/common/Panel';
import { useApi, useLoginQuery, useNavigation } from '@/components/hooks';
import { ChevronDown, ChevronUp, Ellipsis } from '@/components/icons';
import { AiSummaryButton } from '@/components/input/AiSummaryButton';
import { DateFilter } from '@/components/input/DateFilter';
import { ProjectFilterChips, ProjectListFilter } from '@/components/input/ProjectListFilter';
import { formatLatency, formatRate, trendOf } from '@/components/metrics/Fleet';
import { rememberDateRange, resolveDateRange } from '@/lib/dashboard-date';
import { parseDateRange } from '@/lib/date';
import { parseProjectId, propertyLabel } from '@/stellog/operator-report';
import {
  PROJECT_PAGE_SIZE,
  type FilterQuery,
  type ProjectSortKey,
  filterProjects,
  sortProjects,
} from '@/stellog/project-list-filters';

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

const SORTS: { key: ProjectSortKey; label: string; align: 'left' | 'right' }[] = [
  { key: 'name', label: 'Project', align: 'left' },
  { key: 'pageviews', label: 'Pageviews', align: 'right' },
  { key: 'visitors', label: 'Visitors', align: 'right' },
  { key: 'requests', label: 'API requests', align: 'right' },
  { key: 'errorRate', label: 'Error rate', align: 'right' },
  { key: 'p95', label: 'p95', align: 'right' },
  { key: 'trend', label: 'Trend', align: 'right' },
];

export function OperatorProjectsPage() {
  const { get, post, del, useQuery } = useApi();
  const { user } = useLoginQuery();
  const canManage = !!user?.isAdmin;
  const { router, query, updateParams } = useNavigation();
  const [searchDraft, setSearchDraft] = useState(query.q || '');
  const dateValue = resolveDateRange(query.date);
  const parsed = parseDateRange(dateValue) ?? parseDateRange('30day');
  const startAt = parsed?.startDate.getTime() ?? Date.now() - 30 * 24 * 60 * 60 * 1000;
  const endAt = parsed?.endDate.getTime() ?? Date.now();
  const units: readonly string[] = ['minute', 'hour', 'day', 'week', 'month', 'year'];
  const unit = parsed?.unit && units.includes(parsed.unit) ? parsed.unit : 'day';
  const search = `${query.q || ''}`.trim().slice(0, 100);
  const sort = isSort(query.sort) ? query.sort : 'requests';
  const order = query.order === 'asc' ? 'asc' : 'desc';
  const filters = filterQuery(query);

  useEffect(() => {
    setSearchDraft(query.q || '');
  }, [query.q]);

  const projectsQuery = useQuery({
    queryKey: ['operator-projects', startAt, endAt, unit],
    queryFn: () =>
      get('/admin/projects', {
        startAt,
        endAt,
        unit,
        status: 'all',
      }) as Promise<{ enrollmentMode: 'open' | 'approval-required'; projects: Project[] }>,
  });

  const projects = (projectsQuery.data?.projects ?? []).map(project => ({
    ...project,
    sites: project.sites ?? 0,
    apis: project.apis ?? 0,
    websiteIds: project.websiteIds ?? [],
  }));
  const filtered = sortProjects(filterProjects(projects, filters, search), sort, order);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PROJECT_PAGE_SIZE));
  const page = Math.min(pageCount, Math.max(1, Number(query.page) || 1));
  const visible = filtered.slice((page - 1) * PROJECT_PAGE_SIZE, page * PROJECT_PAGE_SIZE);

  const push = (params: Record<string, string | number | undefined>) => {
    if (typeof params.date === 'string') rememberDateRange(params.date);
    router.push(updateParams(params as Record<string, string>));
  };

  const clearFilters = () => {
    setSearchDraft('');
    push({
      q: undefined,
      page: undefined,
      fsrc: undefined,
      ferr: undefined,
      fp95: undefined,
      ftrend: undefined,
      fpv: undefined,
      freq: undefined,
    });
  };

  const toggleSort = (key: ProjectSortKey) => {
    const nextOrder = sort === key && order === 'desc' ? 'asc' : sort === key && order === 'asc' ? 'desc' : key === 'name' ? 'asc' : 'desc';
    push({ sort: key, order: nextOrder, page: undefined });
  };

  return (
    <Column gap="6" margin="2">
      <PageHeader title="Projects">
        <AiSummaryButton scope="projects" />
      </PageHeader>
      <Panel>
        <Column gap="4">
          <div className="stellog-projects-toolbar">
            <div className="stellog-projects-search">
              <SearchField
                value={searchDraft}
                placeholder="Search"
                style={{ width: '100%' }}
                onChange={setSearchDraft}
                onSearch={value => {
                  setSearchDraft(value);
                  push({ q: value.trim() || undefined, page: undefined });
                }}
              />
            </div>
            <div className="stellog-projects-actions">
              <ProjectListFilter query={filters} onApply={params => push({ ...params, page: undefined })} />
              <DateFilter value={dateValue} onChange={value => push({ date: value })} showAllTime={false} />
            </div>
          </div>
          <ProjectFilterChips
            query={filters}
            onApply={params => push({ ...params, page: undefined })}
            onClear={clearFilters}
          />
          {projectsQuery.isLoading && (
            <div className="stellog-shimmer-list" aria-hidden="true">
              <div className="stellog-shimmer stellog-shimmer-head" />
              {Array.from({ length: PROJECT_PAGE_SIZE }, (_, index) => (
                <div key={index} className="stellog-shimmer" />
              ))}
            </div>
          )}
          {projectsQuery.error && <Text>Projects could not be loaded.</Text>}
          {projectsQuery.data && projects.length === 0 && (
            <EmptyCard title="No projects" description="No projects match this range." />
          )}
          {projects.length > 0 && filtered.length === 0 && (
            <EmptyCard title="No projects match these filters">
              <Button onPress={clearFilters}>Clear filters</Button>
            </EmptyCard>
          )}
          {visible.length > 0 && (
            <div className="stellog-projects-table" style={{ overflowX: 'auto' }}>
              <table className="stellog-table">
                <thead>
                  <tr>
                    {SORTS.map(column => (
                      <th key={column.key} style={{ textAlign: column.align }}>
                        <button type="button" className="stellog-sort" onClick={() => toggleSort(column.key)}>
                          {column.label}
                          {sort === column.key && (order === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />)}
                        </button>
                      </th>
                    ))}
                    {canManage && <th />}
                  </tr>
                </thead>
                <tbody>
                  {visible.map(row => {
                    const path = projectPath(row);
                    return (
                      <tr
                        key={row.id}
                        className={path ? 'stellog-project-row' : undefined}
                        onClick={() => path && router.push(path)}
                      >
                        <td>
                          <div className="stellog-project-cell">
                            <ProjectMark name={row.name} domain={row.domain} />
                            <div>
                              <div className="stellog-project-name">{row.name}</div>
                              <span className="stellog-project-meta">{propertyLabel(row.sites, row.apis)}</span>
                            </div>
                          </div>
                        </td>
                        <td>{row.pageviews.toLocaleString()}</td>
                        <td>{(row.visitors ?? 0).toLocaleString()}</td>
                        <td>{row.apis === 0 ? 'Not connected' : row.requests.toLocaleString()}</td>
                        <td>{row.requests === 0 ? '—' : formatRate(row.errorRate)}</td>
                        <td>{formatLatency(row.p95, row.p95Capped)}</td>
                        <td>
                          <span className="stellog-trend">
                            <TrendSpark
                              previous={row.requests > 0 || row.requestsPrevious > 0 ? row.requestsPrevious : row.pageviewsPrevious}
                              current={row.requests > 0 || row.requestsPrevious > 0 ? row.requests : row.pageviews}
                            />
                            {trendOf(row)}
                          </span>
                        </td>
                        {canManage && (
                          <td onClick={event => event.stopPropagation()}>
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
                                              act(post, row, 'approve', () => projectsQuery.refetch());
                                            }}
                                          >
                                            Approve
                                          </Button>
                                        )}
                                        <Button
                                          variant="danger"
                                          onPress={() => {
                                            close();
                                            act(del, row, '', () => projectsQuery.refetch());
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
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {projects.length > 0 && (
            <Row alignItems="center" justifyContent="space-between" gap="3" wrap="wrap">
              <Text color="muted">
                Showing {visible.length} of {projects.length} projects
              </Text>
              {pageCount > 1 && (
                <Row alignItems="center" gap="2">
                  <Button
                    isDisabled={page <= 1}
                    onPress={() => push({ page: page <= 2 ? undefined : String(page - 1) })}
                  >
                    Previous
                  </Button>
                  <Text>
                    {page} / {pageCount}
                  </Text>
                  <Button isDisabled={page >= pageCount} onPress={() => push({ page: String(page + 1) })}>
                    Next
                  </Button>
                </Row>
              )}
            </Row>
          )}
        </Column>
      </Panel>
    </Column>
  );
}

function TrendSpark({ previous, current }: { previous: number; current: number }) {
  if (previous === 0 && current === 0) return null;
  const max = Math.max(previous, current, 1);
  const y = (value: number) => 14 - (value / max) * 12;
  const rising = current >= previous;
  return (
    <svg className="stellog-spark" width="48" height="16" viewBox="0 0 48 16" aria-hidden="true">
      <polyline
        fill="none"
        stroke={rising ? '#3dd68c' : '#f87171'}
        strokeWidth="1.5"
        strokeLinecap="round"
        points={`2,${y(previous)} 46,${y(current)}`}
      />
    </svg>
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

function projectPath(row: { id: string; websiteIds: string[] }) {
  const parsed = parseProjectId(row.id);
  if (parsed?.type === 'team') return `/projects/${parsed.id}`;
  if (row.websiteIds[0]) return `/websites/${row.websiteIds[0]}`;
  return '';
}

function filterQuery(query: Record<string, string>): FilterQuery {
  return {
    fsrc: query.fsrc,
    ferr: query.ferr,
    fp95: query.fp95,
    ftrend: query.ftrend,
    fpv: query.fpv,
    freq: query.freq,
  };
}

function isSort(value: string | undefined): value is ProjectSortKey {
  return (
    value === 'name' ||
    value === 'pageviews' ||
    value === 'visitors' ||
    value === 'requests' ||
    value === 'errorRate' ||
    value === 'p95' ||
    value === 'trend'
  );
}

function ProjectMark({ name, domain }: { name: string; domain: string | null }) {
  if (domain) {
    return (
      <span className="stellog-project-mark stellog-project-mark-table">
        <Favicon domain={domain} />
      </span>
    );
  }
  const letter = name.trim().charAt(0).toUpperCase() || '?';
  return (
    <span className="stellog-project-mark stellog-project-mark-table stellog-project-initial" aria-hidden="true">
      {letter}
    </span>
  );
}
