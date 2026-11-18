'use client';

import { Column, DataColumn, DataTable, Heading, Text } from '@umami/react-zen';
import { EmptyCard } from '@/components/common/EmptyPlaceholder';
import Link from '@/components/common/Link';
import { LoadingPanel } from '@/components/common/LoadingPanel';
import { PageBody } from '@/components/common/PageBody';
import { PageHeader } from '@/components/common/PageHeader';
import { Panel } from '@/components/common/Panel';
import { useMessages, useProjectReportQuery } from '@/components/hooks';
import { DateFilter } from '@/components/input/DateFilter';
import { ListTable } from '@/components/metrics/ListTable';
import { MetricCard } from '@/components/metrics/MetricCard';
import { MetricLabel } from '@/components/metrics/MetricLabel';
import { MetricsBar } from '@/components/metrics/MetricsBar';
import { percentFilter } from '@/lib/filters';
import { formatLongNumber } from '@/lib/format';
import { reportLabel } from '@/stellog/project-nav';
import type { ReportRow } from '@/stellog/project-reports';
import type { MetricRow } from '@/stellog/project-traffic';

export function ProjectReportPage({ section }: { section: string }) {
  const { data, isLoading, error, value, setValue } = useProjectReportQuery(section);

  return (
    <PageBody>
      <Column margin="2" gap="6">
        <PageHeader title={reportLabel(section)}>
          <DateFilter value={value} onChange={setValue} showAllTime={false} />
        </PageHeader>
        <LoadingPanel data={data} isLoading={isLoading && !data} error={error} minHeight="240px">
          {data && (
            <ReportBody section={section} rows={data.rows} lists={data.lists} stats={data.stats} />
          )}
        </LoadingPanel>
      </Column>
    </PageBody>
  );
}

function ReportBody({
  section,
  rows,
  lists,
  stats,
}: {
  section: string;
  rows: ReportRow[];
  lists?: Record<string, MetricRow[]>;
  stats?: Record<string, number | null>;
}) {
  if (section === 'events') return <Events rows={rows} total={stats?.total ?? 0} />;
  if (section === 'sessions') return <Sessions rows={rows} />;
  if (section === 'compare') return <Compare rows={rows} />;
  if (section === 'breakdown') return <Breakdown lists={lists} />;
  if (section === 'utm') return <Utm rows={rows} />;
  if (section === 'attribution') return <Attribution rows={rows} />;
  if (section === 'realtime')
    return <Realtime visitors={stats?.visitors ?? 0} pages={lists?.path} />;
  if (section === 'performance') return <Performance stats={stats} />;
  if (section === 'errors') return <Errors rows={rows} />;
  return <Saved rows={rows} />;
}

function Events({ rows, total }: { rows: ReportRow[]; total: number }) {
  const { t, labels } = useMessages();
  return (
    <Column gap="3">
      <MetricsBar>
        <MetricCard label={t(labels.events)} value={total} formatValue={formatLongNumber} />
      </MetricsBar>
      <Panel>
        <MetricList
          title={t(labels.events)}
          type="event"
          metric={t(labels.events)}
          rows={rows.map(row => ({ x: String(row.name), y: Number(row.count) || 0 }))}
        />
      </Panel>
    </Column>
  );
}

function Sessions({ rows }: { rows: ReportRow[] }) {
  if (rows.length === 0)
    return (
      <Panel>
        <EmptyCard title="No data" description="Nothing in this range." />
      </Panel>
    );
  return (
    <Panel>
      <DataTable data={rows}>
        <DataColumn id="website" label="Project">
          {(row: ReportRow) => <Link href={String(row.href)}>{row.website}</Link>}
        </DataColumn>
        <DataColumn id="createdAt" label="Started">
          {(row: ReportRow) =>
            row.createdAt ? new Date(String(row.createdAt)).toLocaleString() : ''
          }
        </DataColumn>
        <DataColumn id="browser" label="Browser">
          {(row: ReportRow) => row.browser || '—'}
        </DataColumn>
        <DataColumn id="os" label="OS">
          {(row: ReportRow) => row.os || '—'}
        </DataColumn>
        <DataColumn id="country" label="Country">
          {(row: ReportRow) => row.country || '—'}
        </DataColumn>
        <DataColumn id="views" label="Views" align="end">
          {(row: ReportRow) => formatLongNumber(Number(row.views) || 0)}
        </DataColumn>
      </DataTable>
    </Panel>
  );
}

function Compare({ rows }: { rows: ReportRow[] }) {
  if (rows.length === 0)
    return (
      <Panel>
        <EmptyCard title="No data" description="Nothing in this range." />
      </Panel>
    );
  return (
    <Panel>
      <DataTable data={rows}>
        <DataColumn id="website" label="Project">
          {(row: ReportRow) => <Link href={String(row.href)}>{row.website}</Link>}
        </DataColumn>
        <DataColumn id="visitors" label="Visitors" align="end">
          {(row: ReportRow) => formatLongNumber(Number(row.visitors) || 0)}
        </DataColumn>
        <DataColumn id="views" label="Views" align="end">
          {(row: ReportRow) => formatLongNumber(Number(row.views) || 0)}
        </DataColumn>
      </DataTable>
    </Panel>
  );
}

function Breakdown({ lists }: { lists?: Record<string, MetricRow[]> }) {
  const { t, labels } = useMessages();
  const metric = t(labels.visitors);
  return (
    <Column gap="3">
      <Panel>
        <Heading size="2xl">{t(labels.browser)}</Heading>
        <MetricList
          title={t(labels.browser)}
          type="browser"
          metric={metric}
          rows={lists?.browser ?? []}
        />
      </Panel>
      <Panel>
        <Heading size="2xl">{t(labels.os)}</Heading>
        <MetricList title={t(labels.os)} type="os" metric={metric} rows={lists?.os ?? []} />
      </Panel>
      <Panel>
        <Heading size="2xl">{t(labels.device)}</Heading>
        <MetricList
          title={t(labels.device)}
          type="device"
          metric={metric}
          rows={lists?.device ?? []}
        />
      </Panel>
      <Panel>
        <Heading size="2xl">{t(labels.country)}</Heading>
        <MetricList
          title={t(labels.country)}
          type="country"
          metric={metric}
          rows={lists?.country ?? []}
        />
      </Panel>
    </Column>
  );
}

function Utm({ rows }: { rows: ReportRow[] }) {
  if (rows.length === 0)
    return (
      <Panel>
        <EmptyCard title="No data" description="Nothing in this range." />
      </Panel>
    );
  return (
    <Panel>
      <DataTable data={rows}>
        <DataColumn id="website" label="Project">
          {(row: ReportRow) => <Link href={String(row.href)}>{row.website}</Link>}
        </DataColumn>
        <DataColumn id="source" label="Source">
          {(row: ReportRow) => row.source}
        </DataColumn>
        <DataColumn id="medium" label="Medium">
          {(row: ReportRow) => row.medium}
        </DataColumn>
        <DataColumn id="campaign" label="Campaign">
          {(row: ReportRow) => row.campaign}
        </DataColumn>
        <DataColumn id="visitors" label="Visitors" align="end">
          {(row: ReportRow) => formatLongNumber(Number(row.visitors) || 0)}
        </DataColumn>
      </DataTable>
    </Panel>
  );
}

function Attribution({ rows }: { rows: ReportRow[] }) {
  const { t, labels } = useMessages();
  return (
    <Panel>
      <MetricList
        title={t(labels.referrer)}
        type="referrer"
        metric={t(labels.visitors)}
        rows={rows.map(row => ({ x: String(row.source), y: Number(row.visitors) || 0 }))}
      />
    </Panel>
  );
}

function Realtime({ visitors, pages }: { visitors: number; pages?: MetricRow[] }) {
  const { t, labels } = useMessages();
  return (
    <Column gap="3">
      <MetricsBar>
        <MetricCard label={t(labels.visitors)} value={visitors} formatValue={formatLongNumber} />
      </MetricsBar>
      <Panel>
        <Heading size="2xl">{t(labels.pages)}</Heading>
        <MetricList
          title={t(labels.path)}
          type="path"
          metric={t(labels.visitors)}
          rows={pages ?? []}
        />
      </Panel>
    </Column>
  );
}

function Performance({ stats }: { stats?: Record<string, number | null> }) {
  const samples = stats?.samples ?? 0;
  const ms = (value: number | null | undefined) =>
    samples && value != null ? Math.round(value) : 0;
  const format = (value: number | null | undefined, digits = 0) =>
    samples && value != null ? (digits ? value.toFixed(digits) : `${Math.round(value)} ms`) : '—';

  return (
    <Column gap="3">
      <MetricsBar>
        <MetricCard label="LCP" value={ms(stats?.lcp)} formatValue={() => format(stats?.lcp)} />
        <MetricCard label="INP" value={ms(stats?.inp)} formatValue={() => format(stats?.inp)} />
        <MetricCard label="CLS" value={stats?.cls ?? 0} formatValue={() => format(stats?.cls, 3)} />
        <MetricCard label="FCP" value={ms(stats?.fcp)} formatValue={() => format(stats?.fcp)} />
        <MetricCard label="TTFB" value={ms(stats?.ttfb)} formatValue={() => format(stats?.ttfb)} />
      </MetricsBar>
      {samples === 0 && (
        <Panel>
          <EmptyCard title="No data" description="Nothing in this range." />
        </Panel>
      )}
    </Column>
  );
}

function Errors({ rows }: { rows: ReportRow[] }) {
  if (rows.length === 0)
    return (
      <Panel>
        <EmptyCard title="No data" description="Nothing in this range." />
      </Panel>
    );
  return (
    <Panel>
      <DataTable data={rows}>
        <DataColumn id="title" label="Issue">
          {(row: ReportRow) => <Link href={String(row.href)}>{row.title}</Link>}
        </DataColumn>
        <DataColumn id="website" label="Project">
          {(row: ReportRow) => row.website}
        </DataColumn>
        <DataColumn id="status" label="Status">
          {(row: ReportRow) => row.status}
        </DataColumn>
        <DataColumn id="events" label="Events" align="end">
          {(row: ReportRow) => formatLongNumber(Number(row.events) || 0)}
        </DataColumn>
      </DataTable>
    </Panel>
  );
}

function Saved({ rows }: { rows: ReportRow[] }) {
  if (rows.length === 0)
    return (
      <Panel>
        <EmptyCard title="No data" description="Nothing in this range." />
      </Panel>
    );
  return (
    <Panel>
      <DataTable data={rows}>
        <DataColumn id="name" label="Name">
          {(row: ReportRow) => <Link href={String(row.href)}>{row.name}</Link>}
        </DataColumn>
        <DataColumn id="website" label="Project">
          {(row: ReportRow) => row.website}
        </DataColumn>
      </DataTable>
    </Panel>
  );
}

function MetricList({
  title,
  type,
  metric,
  rows,
}: {
  title: string;
  type: string;
  metric: string;
  rows: MetricRow[];
}) {
  const items = percentFilter(rows).map(({ x, y, z }) => ({ label: x, count: y, percent: z }));
  return (
    <ListTable
      data={items}
      title={title}
      metric={metric}
      renderLabel={row =>
        type === 'event' ? <Text>{row.label}</Text> : <MetricLabel type={type} data={row} />
      }
    />
  );
}
