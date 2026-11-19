'use client';

import { Column, Text, Tooltip, TooltipTrigger } from '@umami/react-zen';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Chart } from '@/components/charts/Chart';
import { Favicon } from '@/components/common/Favicon';
import { PageBody } from '@/components/common/PageBody';
import { PageHeader } from '@/components/common/PageHeader';
import { Panel } from '@/components/common/Panel';
import { useApi, useLocale, useLoginQuery, useNavigation, useTimezone } from '@/components/hooks';
import { useProjectDateRange } from '@/components/hooks/useProjectDateRange';
import { Search, X } from '@/components/icons';
import { DateFilter } from '@/components/input/DateFilter';
import { formatLatency, formatRate, trendOf } from '@/components/metrics/Fleet';
import { renderDateLabels } from '@/lib/charts';
import { ROLES } from '@/lib/constants';
import { DATE_FORMATS, formatDate, generateTimeSeries } from '@/lib/date';
import type { MySite } from '@/stellog/my-overview';
import { parseProjectId } from '@/stellog/operator-report';
import { trendPercent } from '@/stellog/project-list-filters';

const LIMIT = 4;

type ChartMetric = 'requests' | 'pageviews' | 'errorRate' | 'p95';

type Project = {
  id: string;
  name: string;
  domain: string | null;
  teamId: string;
  pageviews: number;
  visitors: number;
  requests: number;
  errorRate: number;
  p95: number | null;
  p95Capped?: boolean;
  pageviewsGrowth: number | null;
  pageviewsPrevious: number;
  requestsGrowth: number | null;
  requestsPrevious: number;
};

type Point = { x: string; y: number };
type Series = { pageviews: Point[]; requests: Point[]; errorRate: Point[]; p95: Point[] };

const METRIC_LABEL: Record<ChartMetric, string> = {
  requests: 'Requests',
  pageviews: 'Pageviews',
  errorRate: 'Error rate',
  p95: 'p95',
};

const crosshairPlugin = {
  id: 'stellogCompareCrosshair',
  afterDatasetsDraw(chart: { ctx: CanvasRenderingContext2D; chartArea?: { top: number; bottom: number }; getActiveElements: () => Array<{ element: { x: number } }> }) {
    const active = chart.getActiveElements();
    if (!active.length || !chart.chartArea) return;
    const { ctx, chartArea } = chart;
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.28)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(active[0].element.x, chartArea.top);
    ctx.lineTo(active[0].element.x, chartArea.bottom);
    ctx.stroke();
    ctx.restore();
  },
};

export function CompareProjects() {
  const { user } = useLoginQuery();
  const operator = user?.role === ROLES.admin || user?.role === ROLES.operator || !!user?.isAdmin;
  const { value, setValue, range } = useProjectDateRange();
  const { query, router, updateParams } = useNavigation();
  const { get, useQuery } = useApi();
  const { locale } = useLocale();
  const { timezone, canonicalizeTimezone } = useTimezone();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [metric, setMetric] = useState<ChartMetric>('requests');
  const [series, setSeries] = useState<Record<string, Series>>({});
  const popoverRef = useRef<HTMLDivElement>(null);
  const launchRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const startAt = range?.startDate.getTime();
  const endAt = range?.endDate.getTime();
  const unit = range?.unit || 'day';
  const zone = canonicalizeTimezone(timezone);

  const operatorQuery = useQuery({
    queryKey: ['compare-projects', startAt, endAt, unit],
    queryFn: () =>
      get('/admin/projects', { startAt, endAt, unit, status: 'all', sort: 'requests', order: 'desc' }) as Promise<{
        projects: OperatorRow[];
      }>,
    enabled: operator && startAt != null && endAt != null,
  });
  const tenantQuery = useQuery({
    queryKey: ['compare-overview', startAt, endAt, unit],
    queryFn: () => get('/me/overview', { startAt, endAt, unit }) as Promise<{ sites: MySite[] }>,
    enabled: !operator && !!user && startAt != null && endAt != null,
  });

  const loading = !user || (operator ? operatorQuery.isLoading : tenantQuery.isLoading);
  const projects = useMemo(
    () =>
      operator
        ? (operatorQuery.data?.projects ?? []).map(operatorProject)
        : groupSites(tenantQuery.data?.sites ?? []),
    [operator, operatorQuery.data, tenantQuery.data],
  );
  const specified = Object.prototype.hasOwnProperty.call(query, 'projects');
  const chosen = specified
    ? String(query.projects || '')
        .split(',')
        .filter(Boolean)
    : projects.slice(0, LIMIT).map(project => project.id);
  const selected = chosen
    .map(id => projects.find(project => project.id === id))
    .filter((project): project is Project => !!project);
  const full = selected.length >= LIMIT;

  const write = useCallback(
    (ids: string[]) => {
      router.replace(updateParams({ projects: ids.join(',') }));
    },
    [router, updateParams],
  );

  useEffect(() => {
    if (loading || specified || projects.length === 0) return;
    router.replace(updateParams({ projects: projects.slice(0, LIMIT).map(project => project.id).join(',') }));
  }, [loading, specified, projects, router, updateParams]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      event.preventDefault();
      setOpen(true);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    const onPointer = (event: MouseEvent) => {
      const target = event.target as Node;
      if (popoverRef.current?.contains(target) || launchRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onPointer);
    };
  }, [open]);

  useEffect(() => {
    if (open) searchRef.current?.focus();
  }, [open]);

  const toggle = (id: string) => {
    const next = chosen.includes(id) ? chosen.filter(item => item !== id) : chosen.length >= LIMIT ? chosen : [...chosen, id];
    write(next);
  };

  const applyPreset = (kind: 'requests' | 'growth' | 'errors' | 'clear') => {
    if (kind === 'clear') {
      write([]);
      return;
    }
    const ranked = [...projects].sort((left, right) => {
      if (kind === 'growth') return (right.requestsGrowth ?? -Infinity) - (left.requestsGrowth ?? -Infinity);
      if (kind === 'errors') {
        const leftRate = left.requests === 0 ? Infinity : left.errorRate;
        const rightRate = right.requests === 0 ? Infinity : right.errorRate;
        return leftRate - rightRate;
      }
      return right.requests - left.requests;
    });
    write(ranked.slice(0, LIMIT).map(project => project.id));
  };

  const reportSeries = useCallback((id: string, next: Series) => {
    setSeries(current => (current[id] === next ? current : { ...current, [id]: next }));
  }, []);

  const openProject = (project: Project) => {
    router.push(value ? `/projects/${project.teamId}?date=${encodeURIComponent(value)}` : `/projects/${project.teamId}`);
  };

  return (
    <PageBody>
      <Column margin="2" gap="6">
        <PageHeader title="Compare" description="Pick up to 4 projects to see them side by side.">
          <DateFilter value={value} onChange={setValue} showAllTime={false} />
        </PageHeader>
        <div className="stellog-compare-bar">
          {loading
            ? [108, 96, 112, 88].map(width => (
                <div key={width} className="stellog-shimmer stellog-pick-shimmer" style={{ width }} />
              ))
            : selected.map(project => (
                <button key={project.id} type="button" className="stellog-compare-chip" onClick={() => toggle(project.id)}>
                  <span className="stellog-compare-dot" style={{ background: colorFor(project.id, projects) }} />
                  <b>{project.name}</b>
                  <X size={14} />
                </button>
              ))}
          {!loading && <span className="stellog-compare-count">{selected.length} of {LIMIT}</span>}
          <button ref={launchRef} type="button" className="stellog-compare-search" onClick={() => setOpen(value => !value)}>
            <Search size={14} />
            Search projects
          </button>
          {open && !loading && (
            <div ref={popoverRef} className="stellog-compare-popover" role="dialog" aria-label="Search projects">
              <input
                ref={searchRef}
                value={search}
                placeholder="Search projects"
                onChange={event => setSearch(event.target.value)}
              />
              <div className="stellog-compare-presets">
                <button type="button" onClick={() => applyPreset('requests')}>Top 4 by requests</button>
                <button type="button" onClick={() => applyPreset('growth')}>Fastest growing</button>
                <button type="button" onClick={() => applyPreset('errors')}>Lowest error rate</button>
                <button type="button" onClick={() => applyPreset('clear')}>Clear</button>
              </div>
              <div className="stellog-compare-list">
                {ordered(projects, chosen)
                  .filter(project => project.name.toLowerCase().includes(search.trim().toLowerCase()))
                  .map(project => {
                    const on = chosen.includes(project.id);
                    const blocked = !on && full;
                    const row = (
                      <button
                        type="button"
                        className="stellog-compare-option"
                        aria-pressed={on}
                        aria-disabled={blocked}
                        onClick={() => {
                          if (!blocked) toggle(project.id);
                        }}
                      >
                        <Favicon domain={project.domain} />
                        <span>
                          <strong>{project.name}</strong>
                          <small>
                            {project.requests.toLocaleString()} API requests · {project.requests === 0 ? '—' : formatRate(project.errorRate)}
                          </small>
                        </span>
                        <span className="stellog-compare-check" data-on={on ? 'true' : 'false'} />
                      </button>
                    );
                    return blocked ? (
                      <TooltipTrigger key={project.id} delay={0}>
                        {row}
                        <Tooltip>Max 4</Tooltip>
                      </TooltipTrigger>
                    ) : (
                      <span key={project.id}>{row}</span>
                    );
                  })}
              </div>
            </div>
          )}
        </div>
        {selected.length === 1 && <p className="stellog-compare-hint">Add another project to compare.</p>}
        {selected.map(project => (
          <ProjectSeries
            key={project.id}
            project={project}
            startAt={startAt}
            endAt={endAt}
            unit={unit}
            timezone={zone}
            onSeries={reportSeries}
          />
        ))}
        {loading ? (
          <>
            <div className="stellog-shimmer" style={{ height: 340 }} />
            <div className="stellog-shimmer" style={{ height: 220 }} />
          </>
        ) : selected.length === 0 ? (
          <Panel>
            <div className="stellog-compare-empty">
              <Text>Pick a project to start comparing</Text>
              <button type="button" className="stellog-compare-search" style={{ marginLeft: 0 }} onClick={() => setOpen(true)}>
                <Search size={14} />
                Search projects
              </button>
            </div>
          </Panel>
        ) : (
          <>
            <Panel>
              <div className="stellog-compare-head">
                <h2>{METRIC_LABEL[metric]} per {unit === 'hour' || unit === 'minute' ? 'hour' : 'day'}</h2>
                <div className="stellog-compare-metrics">
                  {(Object.keys(METRIC_LABEL) as ChartMetric[]).map(key => (
                    <button key={key} type="button" aria-pressed={metric === key} onClick={() => setMetric(key)}>
                      {METRIC_LABEL[key]}
                    </button>
                  ))}
                </div>
              </div>
              <CompareChart
                metric={metric}
                projects={selected}
                catalog={projects}
                series={series}
                start={range?.startDate}
                end={range?.endDate}
                unit={unit}
                locale={locale}
              />
            </Panel>
            <Panel>
              <div style={{ overflowX: 'auto' }}>
                <table className="stellog-table stellog-compare-table">
                  <thead>
                    <tr>
                      <th>Project</th>
                      <th>Pageviews</th>
                      <th>API requests</th>
                      <th>Error rate</th>
                      <th>p95</th>
                      <th>Trend</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selected.map(project => (
                      <tr key={project.id} onClick={() => openProject(project)}>
                        <td>
                          <span className="stellog-compare-name" style={{ justifyContent: 'flex-start' }}>
                            <span className="stellog-compare-dot" style={{ background: colorFor(project.id, projects) }} />
                            {project.name}
                          </span>
                        </td>
                        <Cell best={best(selected, 'pageviews', project.pageviews)}>{project.pageviews.toLocaleString()}</Cell>
                        <Cell best={best(selected, 'requests', project.requests)}>{project.requests.toLocaleString()}</Cell>
                        <Cell best={best(selected, 'errorRate', project.requests === 0 ? null : project.errorRate)}>
                          {project.requests === 0 ? '—' : formatRate(project.errorRate)}
                        </Cell>
                        <Cell best={best(selected, 'p95', project.p95)}>{formatLatency(project.p95, project.p95Capped)}</Cell>
                        <Cell best={best(selected, 'trend', trendPercent(project))}>{trendOf(project)}</Cell>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          </>
        )}
      </Column>
    </PageBody>
  );
}

function Cell({ best, children }: { best: boolean; children: string }) {
  return <td className={best ? 'stellog-compare-best' : undefined}>{children}</td>;
}

function best(projects: Project[], key: 'pageviews' | 'requests' | 'errorRate' | 'p95' | 'trend', value: number | null) {
  if (projects.length < 2 || value == null) return false;
  const values = projects
    .map(project => {
      if (key === 'pageviews') return project.pageviews;
      if (key === 'requests') return project.requests;
      if (key === 'errorRate') return project.requests === 0 ? null : project.errorRate;
      if (key === 'p95') return project.p95;
      return trendPercent(project);
    })
    .filter((item): item is number => item != null);
  if (!values.length) return false;
  const target = key === 'errorRate' || key === 'p95' ? Math.min(...values) : Math.max(...values);
  return value === target;
}

function ordered(projects: Project[], chosen: string[]) {
  const rank = new Map(chosen.map((id, index) => [id, index]));
  return [...projects].sort((left, right) => {
    const leftRank = rank.has(left.id) ? rank.get(left.id)! : chosen.length;
    const rightRank = rank.has(right.id) ? rank.get(right.id)! : chosen.length;
    return leftRank - rightRank || left.name.localeCompare(right.name);
  });
}

function colorFor(id: string, catalog: Project[]) {
  const index = Math.max(0, [...catalog].map(project => project.id).sort().indexOf(id));
  const hue = Math.round((index * 360) / Math.max(catalog.length, 1));
  return `hsl(${hue} 68% 62%)`;
}

function CompareChart({
  metric,
  projects,
  catalog,
  series,
  start,
  end,
  unit,
  locale,
}: {
  metric: ChartMetric;
  projects: Project[];
  catalog: Project[];
  series: Record<string, Series>;
  start?: Date;
  end?: Date;
  unit: string;
  locale: string;
}) {
  const [tooltip, setTooltip] = useState<{ x: number; y: number; title: string; rows: Array<{ name: string; color: string; value: string }> } | null>(null);
  const ready = projects.every(project => series[project.id]);
  const chartData = useMemo(() => {
    if (!ready || !start || !end) return { datasets: [] };
    return {
      datasets: projects.map(project => ({
        label: '',
        projectName: project.name,
        data: generateTimeSeries(series[project.id][metric], start, end, unit, locale),
        borderColor: colorFor(project.id, catalog),
        backgroundColor: colorFor(project.id, catalog),
        borderWidth: 2,
        pointRadius: 0,
        pointHoverRadius: 3,
        tension: 0.35,
        fill: false,
        spanGaps: true,
      })),
    };
  }, [ready, projects, catalog, series, metric, start, end, unit, locale]);
  const renderXLabel = useMemo(() => renderDateLabels(unit, locale), [unit, locale]);
  const onTooltip = useCallback(
    (model: { tooltip?: { opacity: number; caretX: number; caretY: number; dataPoints?: Array<{ dataset: { projectName?: string; borderColor?: string }; raw?: { y?: number | null } }> } }) => {
      const tip = model.tooltip;
      if (!tip?.opacity || !tip.dataPoints?.length) {
        setTooltip(null);
        return;
      }
      setTooltip({
        x: tip.caretX,
        y: tip.caretY,
        title: String((tip.dataPoints[0].raw as { x?: string } | undefined)?.x || ''),
        rows: tip.dataPoints.map(point => ({
          name: point.dataset.projectName || '',
          color: String(point.dataset.borderColor || ''),
          value: formatChartValue(metric, point.raw?.y ?? null),
        })),
      });
    },
    [metric, unit, locale],
  );
  const chartOptions = useMemo(
    () => ({
      interaction: { mode: 'index', intersect: false },
      plugins: { tooltip: { intersect: false } },
      scales: {
        x: {
          type: 'timeseries',
          min: formatDate(start, DATE_FORMATS[unit], locale),
          max: formatDate(end, DATE_FORMATS[unit], locale),
          offset: true,
          grid: { display: false },
          border: { display: false },
          ticks: { color: 'rgba(255,255,255,0.55)', maxRotation: 0, autoSkip: true, callback: renderXLabel },
        },
        y: {
          min: 0,
          beginAtZero: true,
          grid: { color: 'rgba(255,255,255,0.06)' },
          border: { display: false },
          ticks: {
            color: 'rgba(255,255,255,0.55)',
            maxTicksLimit: 6,
            callback: (value: number) => formatChartValue(metric, Number(value)),
          },
        },
      },
    }),
    [start, end, renderXLabel, metric, unit, locale],
  );

  if (!ready || !start || !end) return <div className="stellog-shimmer" style={{ height: 280 }} />;

  return (
    <div className="stellog-compare-plot">
      <Chart
        type="line"
        height="280px"
        animationDuration={0}
        chartData={chartData}
        chartOptions={chartOptions}
        chartPlugins={[crosshairPlugin]}
        onTooltip={onTooltip}
      />
      {tooltip && (
        <div className="stellog-compare-tooltip" style={{ left: Math.min(tooltip.x, 220), top: Math.max(8, tooltip.y - 72) }}>
          <strong>{tooltip.title}</strong>
          {tooltip.rows.map(row => (
            <div key={row.name}>
              <span><i className="stellog-compare-dot" style={{ background: row.color, display: 'inline-block', marginRight: 6 }} />{row.name}</span>
              <span>{row.value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function formatChartValue(metric: ChartMetric, value: number | null) {
  if (value == null || Number.isNaN(value)) return '—';
  if (metric === 'errorRate') return formatRate(value);
  if (metric === 'p95') return `${Math.round(value)} ms`;
  return Math.round(value).toLocaleString();
}

function ProjectSeries({
  project,
  startAt,
  endAt,
  unit,
  timezone,
  onSeries,
}: {
  project: Project;
  startAt?: number;
  endAt?: number;
  unit: string;
  timezone: string;
  onSeries: (id: string, series: Series) => void;
}) {
  const { get, useQuery } = useApi();
  const enabled = startAt != null && endAt != null;
  const view = useQuery({
    queryKey: ['compare-view', project.teamId, startAt, endAt, unit],
    queryFn: () =>
      get(`/projects/${project.teamId}`, { startAt, endAt, unit }) as Promise<{
        sites?: Array<{ id: string }>;
        apis?: Array<{ id: string }>;
      }>,
    enabled,
  });
  const siteId = view.data?.sites?.[0]?.id;
  const apiId = view.data?.apis?.[0]?.id;
  const pages = useQuery({
    queryKey: ['compare-pages', siteId, startAt, endAt, unit, timezone],
    queryFn: () =>
      get(`/websites/${siteId}/pageviews`, { startAt, endAt, unit, timezone }) as Promise<{ pageviews: Point[] }>,
    enabled: enabled && !!siteId,
  });
  const api = useQuery({
    queryKey: ['compare-api', apiId, startAt, endAt, unit],
    queryFn: () =>
      get(`/websites/${apiId}/api-metrics`, { startAt, endAt, unit }) as Promise<{
        series?: Point[];
        points?: Array<{ x: string; requests: number; errors: number; p95: number | null }>;
      }>,
    enabled: enabled && !!apiId,
  });
  const ready =
    !enabled ||
    view.isError ||
    (view.isFetched && (!siteId || pages.isFetched || pages.isError) && (!apiId || api.isFetched || api.isError));
  const payload = useMemo<Series | null>(() => {
    if (!ready) return null;
    const points = api.data?.points ?? [];
    return {
      pageviews: pages.data?.pageviews ?? [],
      requests: points.length ? points.map(point => ({ x: point.x, y: point.requests })) : api.data?.series ?? [],
      errorRate: points.map(point => ({ x: point.x, y: point.requests === 0 ? 0 : point.errors / point.requests })),
      p95: points.filter(point => point.p95 != null).map(point => ({ x: point.x, y: point.p95 as number })),
    };
  }, [ready, pages.data, api.data]);

  useEffect(() => {
    if (payload) onSeries(project.id, payload);
  }, [payload, onSeries, project.id]);

  return null;
}

type OperatorRow = {
  id: string;
  name: string;
  domain: string | null;
  pageviews: number;
  visitors: number;
  requests: number;
  errorRate: number;
  p95: number | null;
  p95Capped?: boolean;
  pageviewsGrowth: number | null;
  pageviewsPrevious: number;
  requestsGrowth: number | null;
  requestsPrevious: number;
};

function operatorProject(project: OperatorRow): Project {
  return { ...project, teamId: parseProjectId(project.id)?.id ?? project.id };
}

function groupSites(sites: MySite[]): Project[] {
  const byTeam = new Map<string, MySite[]>();
  for (const site of sites) {
    if (!site.teamId) continue;
    const owned = byTeam.get(site.teamId) ?? [];
    owned.push(site);
    byTeam.set(site.teamId, owned);
  }
  return [...byTeam.entries()]
    .map(([teamId, owned]) => {
      const requests = owned.reduce((sum, site) => sum + site.requests, 0);
      const previousRequests = owned.reduce((sum, site) => sum + site.requestsPrevious, 0);
      const pageviews = owned.reduce((sum, site) => sum + site.pageviews, 0);
      const previousViews = owned.reduce((sum, site) => sum + site.pageviewsPrevious, 0);
      const visitors = owned.reduce((sum, site) => sum + site.visitors, 0);
      const errors = owned.reduce((sum, site) => sum + site.errors, 0);
      const api = owned.find(site => site.kind === 'api' && site.p95 != null);
      const web = owned.find(site => site.kind === 'site');
      return {
        id: teamId,
        teamId,
        name: owned.find(site => site.teamName)?.teamName || 'Project',
        domain: web?.domain ?? owned.find(site => site.domain && !site.domain.startsWith('api.'))?.domain ?? null,
        pageviews,
        visitors,
        requests,
        errorRate: requests === 0 ? 0 : errors / requests,
        p95: api?.p95 ?? null,
        p95Capped: api?.p95Capped,
        pageviewsGrowth: previousViews === 0 ? (pageviews === 0 ? 0 : null) : (pageviews - previousViews) / previousViews,
        pageviewsPrevious: previousViews,
        requestsGrowth: previousRequests === 0 ? (requests === 0 ? 0 : null) : (requests - previousRequests) / previousRequests,
        requestsPrevious: previousRequests,
      };
    })
    .sort((left, right) => right.requests - left.requests || left.name.localeCompare(right.name));
}
