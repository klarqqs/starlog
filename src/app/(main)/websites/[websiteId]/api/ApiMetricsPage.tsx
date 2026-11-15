'use client';

import { Column, Grid, Heading, Row, Text, useTheme } from '@umami/react-zen';
import { useCallback, useMemo } from 'react';
import { WebsiteControls } from '@/app/(main)/websites/[websiteId]/WebsiteControls';
import { BarChart } from '@/components/charts/BarChart';
import { Panel } from '@/components/common/Panel';
import { useApi, useDateRange, useLocale } from '@/components/hooks';
import { renderDateLabels } from '@/lib/charts';
import { getThemeColors } from '@/lib/colors';
import { generateTimeSeries } from '@/lib/date';

type Latency = {
  p50: number | null;
  p95: number | null;
  p50Capped: boolean;
  p95Capped: boolean;
};

type TenantMetrics = Latency & {
  websiteId: string;
  unit: 'hour' | 'day';
  requests: number;
  series: Array<{ x: string; y: number }>;
  routes: Array<{ route: string; requests: number } & Latency>;
  statuses: Array<{ statusCode: number; requests: number; share: number }>;
};

export function ApiMetricsPage({ websiteId }: { websiteId: string }) {
  const { get, useQuery } = useApi();
  const { dateRange } = useDateRange();
  const unit = dateRange.unit;
  const { locale, dateLocale } = useLocale();
  const { theme } = useTheme();
  const { colors } = useMemo(() => getThemeColors(theme), [theme]);
  const startAt = dateRange.startDate.getTime();
  const endAt = dateRange.endDate.getTime();

  const { data, isLoading, error } = useQuery({
    queryKey: ['api-metrics', websiteId, startAt, endAt, unit],
    queryFn: () =>
      get(`/websites/${websiteId}/api-metrics`, {
        startAt,
        endAt,
        unit,
      }) as Promise<TenantMetrics>,
  });

  const chartData = useMemo(() => {
    if (!data) return;
    return {
      datasets: [
        {
          label: 'Requests',
          data: generateTimeSeries(
            chartSeries(data.series, data.unit),
            dateRange.startDate,
            dateRange.endDate,
            data.unit,
            dateLocale,
          ),
          borderWidth: 1,
          ...colors.chart.views,
        },
      ],
    };
  }, [data, dateRange.startDate, dateRange.endDate, dateLocale, colors.chart.views]);

  const renderXLabel = useCallback(data ? renderDateLabels(data.unit, locale) : () => '', [
    data,
    locale,
  ]);

  return (
    <Column gap="3">
      <WebsiteControls websiteId={websiteId} allowFilter={false} />
      {isLoading && <Text>Loading API traffic.</Text>}
      {error && <Text>API traffic could not be loaded.</Text>}
      {data && (
        <Column gap="3">
          <Grid columns={{ base: '1fr', md: 'repeat(3, 1fr)' }} gap>
            <Stat label="Requests" value={data.requests.toLocaleString(dateLocale)} />
            <Stat label="p50 latency" value={formatLatency(data.p50, data.p50Capped)} />
            <Stat label="p95 latency" value={formatLatency(data.p95, data.p95Capped)} />
          </Grid>
          <Panel title="Request volume">
            <BarChart
              chartData={chartData}
              unit={data.unit}
              minDate={dateRange.startDate}
              maxDate={dateRange.endDate}
              height="320px"
              renderXLabel={renderXLabel}
            />
          </Panel>
          <Grid columns={{ base: '1fr', lg: '1.4fr 0.8fr' }} gap>
            <Panel title="Routes">
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <Th>Route</Th>
                    <Th align="right">Requests</Th>
                    <Th align="right">p50</Th>
                    <Th align="right">p95</Th>
                  </tr>
                </thead>
                <tbody>
                  {data.routes.length === 0 && (
                    <tr>
                      <Td colSpan={4}>No API requests in this range.</Td>
                    </tr>
                  )}
                  {data.routes.map(route => (
                    <tr key={route.route}>
                      <Td>{route.route}</Td>
                      <Td align="right">{route.requests.toLocaleString(dateLocale)}</Td>
                      <Td align="right">{formatLatency(route.p50, route.p50Capped)}</Td>
                      <Td align="right">{formatLatency(route.p95, route.p95Capped)}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Panel>
            <Panel title="Status codes">
              <Column gap="2">
                {data.statuses.length === 0 && <Text>No API requests in this range.</Text>}
                {data.statuses.map(status => (
                  <Column key={status.statusCode} gap="1">
                    <Row justifyContent="space-between">
                      <Text>{status.statusCode}</Text>
                      <Text>
                        {status.requests.toLocaleString(dateLocale)} ·{' '}
                        {Math.round(status.share * 100)}%
                      </Text>
                    </Row>
                    <div style={{ height: 8, background: 'var(--border-color, #e5e5e5)' }}>
                      <div
                        style={{
                          height: '100%',
                          width: `${Math.max(0, Math.min(100, status.share * 100))}%`,
                          background:
                            status.statusCode >= 500
                              ? '#b42318'
                              : status.statusCode >= 400
                                ? '#b54708'
                                : '#087443',
                        }}
                      />
                    </div>
                  </Column>
                ))}
              </Column>
            </Panel>
          </Grid>
        </Column>
      )}
    </Column>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Panel>
      <Column gap="1">
        <Text>{label}</Text>
        <Heading>{value}</Heading>
      </Column>
    </Panel>
  );
}

function Th({ children, align = 'left' }: { children: string; align?: 'left' | 'right' }) {
  return (
    <th
      style={{
        textAlign: align,
        fontWeight: 600,
        padding: '8px 6px',
        borderBottom: '1px solid var(--border-color, #e5e5e5)',
      }}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  align = 'left',
  colSpan,
}: {
  children: string;
  align?: 'left' | 'right';
  colSpan?: number;
}) {
  return (
    <td
      colSpan={colSpan}
      style={{
        textAlign: align,
        padding: '8px 6px',
        borderBottom: '1px solid var(--border-color, #eee)',
      }}
    >
      {children}
    </td>
  );
}

function chartSeries(series: Array<{ x: string; y: number }>, unit: 'hour' | 'day') {
  if (unit === 'day') return series;
  return series.map(point => ({ x: localHourStamp(point.x), y: point.y }));
}

function localHourStamp(iso: string) {
  const date = new Date(iso);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:00:00Z`;
}

function formatLatency(ms: number | null, capped: boolean) {
  if (capped) return '> 10s';
  if (ms === null) return '—';
  if (ms >= 1000) return `${ms / 1000}s`;
  return `${ms} ms`;
}
