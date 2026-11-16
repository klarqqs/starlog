'use client';

import { Column, Grid, Heading, Row, Tab, TabList, TabPanel, Tabs } from '@umami/react-zen';
import type { ReactNode } from 'react';
import type { ChartAnnotation } from '@/components/charts/ChartAnnotationMarkers';
import { GridRow } from '@/components/common/GridRow';
import { LoadingPanel } from '@/components/common/LoadingPanel';
import { Panel } from '@/components/common/Panel';
import { useMessages, useMobile, useProjectTrafficQuery } from '@/components/hooks';
import { UnitFilter } from '@/components/input/UnitFilter';
import { ListTable } from '@/components/metrics/ListTable';
import { MetricCard } from '@/components/metrics/MetricCard';
import { MetricLabel } from '@/components/metrics/MetricLabel';
import { MetricsBar } from '@/components/metrics/MetricsBar';
import { PageviewsChart } from '@/components/metrics/PageviewsChart';
import { WeeklyTraffic } from '@/components/metrics/WeeklyTraffic';
import { WorldMap } from '@/components/metrics/WorldMap';
import { DATE_FUNCTIONS } from '@/lib/date';
import { percentFilter } from '@/lib/filters';
import { formatLongNumber, formatShortTime } from '@/lib/format';
import type { MetricRow, ProjectTraffic as Traffic, TrafficStats } from '@/stellog/project-traffic';

export function ProjectTraffic({ afterMetrics }: { afterMetrics?: ReactNode }) {
  const { data, isLoading, error, range } = useProjectTrafficQuery();
  const { t, labels } = useMessages();
  const unit = range?.unit || 'day';
  const notes: ChartAnnotation[] = (data?.notes ?? []).map(note => {
    const date = new Date(note.date);
    return {
      id: note.id,
      date,
      markerDate: DATE_FUNCTIONS[unit]?.start(date) ?? date,
      label: note.note,
      allDay: note.allDay,
    };
  });

  return (
    <LoadingPanel data={data} isLoading={isLoading && !data} error={error} minHeight="320px">
      {data && range && (
        <Column gap="3">
          <MetricsBar>
            {cards(data.stats, data.previous, t, labels).map(metric => (
              <MetricCard key={metric.label} {...metric} showChange />
            ))}
          </MetricsBar>
          {afterMetrics}
          <Panel minHeight="520px">
            <Row justifyContent="end">
              <UnitFilter />
            </Row>
            <PageviewsChart
              data={{ pageviews: data.pageviews, sessions: data.sessions }}
              unit={unit}
              minDate={range.startDate}
              maxDate={range.endDate}
              annotations={notes}
            />
          </Panel>
          <TrafficPanels data={data} />
        </Column>
      )}
    </LoadingPanel>
  );
}

function cards(
  stats: TrafficStats,
  previous: TrafficStats,
  t: (value: string) => string,
  labels: Record<string, string>,
) {
  const rate = (value: TrafficStats) =>
    value.visits ? (Math.min(value.visits, value.bounces) / value.visits) * 100 : 0;
  const duration = (value: TrafficStats) => (value.visits ? value.totaltime / value.visits : 0);
  const bounce = rate(stats);
  const bouncePrevious = rate(previous);

  return [
    {
      value: stats.visitors,
      change: stats.visitors - previous.visitors,
      label: t(labels.visitors),
      formatValue: formatLongNumber,
    },
    {
      value: stats.visits,
      change: stats.visits - previous.visits,
      label: t(labels.visits),
      formatValue: formatLongNumber,
    },
    {
      value: stats.pageviews,
      change: stats.pageviews - previous.pageviews,
      label: t(labels.views),
      formatValue: formatLongNumber,
    },
    {
      value: bounce,
      change: bounce - bouncePrevious,
      label: t(labels.bounceRate),
      formatValue: (n: number) => `${Math.round(+n) || 0}%`,
      reverseColors: true,
    },
    {
      value: duration(stats),
      change: duration(stats) - duration(previous),
      label: t(labels.visitDuration),
      formatValue: (n: number) =>
        `${+n < 0 ? '-' : ''}${formatShortTime(Math.abs(~~n), ['m', 's'], ' ')}`,
    },
  ];
}

function TrafficPanels({ data }: { data: Traffic }) {
  const { t, labels } = useMessages();
  const { isMobile } = useMobile();
  const metric = t(labels.visitors);

  return (
    <Grid gap="3">
      <GridRow layout="two" minHeight="570px">
        <Panel>
          <Heading size="2xl">{t(labels.pages)}</Heading>
          <Tabs>
            <TabList>
              <Tab id="path">{t(labels.path)}</Tab>
              <Tab id="url">{t(labels.url)}</Tab>
              <Tab id="entry">{t(labels.entry)}</Tab>
              <Tab id="exit">{t(labels.exit)}</Tab>
            </TabList>
            <TabPanel id="path">
              <MetricList
                title={t(labels.path)}
                type="path"
                metric={metric}
                rows={data.pages.path}
              />
            </TabPanel>
            <TabPanel id="url">
              <MetricList
                title={t(labels.url)}
                type="fullPath"
                metric={metric}
                rows={data.pages.url}
              />
            </TabPanel>
            <TabPanel id="entry">
              <MetricList
                title={t(labels.path)}
                type="entry"
                metric={metric}
                rows={data.pages.entry}
              />
            </TabPanel>
            <TabPanel id="exit">
              <MetricList
                title={t(labels.path)}
                type="exit"
                metric={metric}
                rows={data.pages.exit}
              />
            </TabPanel>
          </Tabs>
        </Panel>
        <Panel>
          <Heading size="2xl">{t(labels.sources)}</Heading>
          <Tabs>
            <TabList>
              <Tab id="referrer">{t(labels.referrers)}</Tab>
              <Tab id="channel">{t(labels.channels)}</Tab>
            </TabList>
            <TabPanel id="referrer">
              <MetricList
                title={t(labels.referrer)}
                type="referrer"
                metric={metric}
                rows={data.sources.referrer}
              />
            </TabPanel>
            <TabPanel id="channel">
              <MetricList
                title={t(labels.channel)}
                type="channel"
                metric={metric}
                rows={data.sources.channel}
              />
            </TabPanel>
          </Tabs>
        </Panel>
      </GridRow>
      <GridRow layout="two" minHeight="570px">
        <Panel>
          <Heading size="2xl">{t(labels.environment)}</Heading>
          <Tabs>
            <TabList>
              <Tab id="browser">{t(labels.browsers)}</Tab>
              <Tab id="os">{t(labels.os)}</Tab>
              <Tab id="device">{t(labels.devices)}</Tab>
            </TabList>
            <TabPanel id="browser">
              <MetricList
                title={t(labels.browser)}
                type="browser"
                metric={metric}
                rows={data.environment.browser}
              />
            </TabPanel>
            <TabPanel id="os">
              <MetricList
                title={t(labels.os)}
                type="os"
                metric={metric}
                rows={data.environment.os}
              />
            </TabPanel>
            <TabPanel id="device">
              <MetricList
                title={t(labels.device)}
                type="device"
                metric={metric}
                rows={data.environment.device}
              />
            </TabPanel>
          </Tabs>
        </Panel>
        <Panel>
          <Heading size="2xl">{t(labels.location)}</Heading>
          <Tabs>
            <TabList>
              <Tab id="country">{t(labels.countries)}</Tab>
              <Tab id="region">{t(labels.regions)}</Tab>
              <Tab id="city">{t(labels.cities)}</Tab>
            </TabList>
            <TabPanel id="country">
              <MetricList
                title={t(labels.country)}
                type="country"
                metric={metric}
                rows={data.location.country}
              />
            </TabPanel>
            <TabPanel id="region">
              <MetricList
                title={t(labels.region)}
                type="region"
                metric={metric}
                rows={data.location.region}
              />
            </TabPanel>
            <TabPanel id="city">
              <MetricList
                title={t(labels.city)}
                type="city"
                metric={metric}
                rows={data.location.city}
              />
            </TabPanel>
          </Tabs>
        </Panel>
      </GridRow>
      <GridRow layout="two-one" minHeight="570px">
        <Panel paddingX="0" paddingY="0" style={{ gridColumn: isMobile ? 'span 1' : 'span 2' }}>
          <WorldMap data={data.location.country} />
        </Panel>
        <Panel>
          <Heading size="2xl">{t(labels.traffic)}</Heading>
          <Row border="bottom" marginBottom="4" />
          <WeeklyTraffic data={data.weekly} />
        </Panel>
      </GridRow>
    </Grid>
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
      renderLabel={row => <MetricLabel type={type} data={row} />}
    />
  );
}
