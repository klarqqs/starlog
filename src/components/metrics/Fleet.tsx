'use client';

import { Row } from '@umami/react-zen';
import { useRouter } from 'next/navigation';
import { Favicon } from '@/components/common/Favicon';
import { formatLongNumber } from '@/lib/format';
import { displayedTrend } from '@/stellog/demo-series';

export type FleetRow = {
  id: string;
  name: string;
  href?: string | null;
  domain?: string | null;
  pageviews: number;
  requests: number;
  errorRate: number;
  p95: number | null;
  p95Capped?: boolean;
  growth: number | null;
  previous: number;
  current: number;
};

export function DemoMark() {
  return <span className="stellog-demo">Demo data</span>;
}

export function MetricCards({
  pageviews,
  visitors,
  requests,
  p95,
  pageviewsTrend,
  visitorsTrend,
  requestsTrend,
  errorDetail,
}: {
  pageviews: number;
  visitors: number;
  requests: number;
  p95: string;
  pageviewsTrend?: string | null;
  visitorsTrend?: string | null;
  requestsTrend?: string | null;
  errorDetail?: string | null;
}) {
  const cards = [
    { label: 'Pageviews', value: formatLongNumber(pageviews), trend: pageviewsTrend },
    { label: 'Visitors', value: formatLongNumber(visitors), trend: visitorsTrend },
    { label: 'API requests', value: formatLongNumber(requests), trend: requestsTrend, detail: errorDetail },
    { label: 'p95 latency', value: p95 },
  ];
  return (
    <div className="stellog-cards">
      {cards.map(card => (
        <article key={card.label} className="stellog-card stellog-metric">
          <span>{card.label}</span>
          <p>
            <strong>{card.value}</strong>
            {card.trend && card.trend !== '—' ? <em>{card.trend}</em> : null}
          </p>
          {card.detail ? <small>{card.detail}</small> : null}
        </article>
      ))}
    </div>
  );
}

export function FleetTable({
  rows,
  viewAllHref,
  title = 'Projects',
}: {
  rows: FleetRow[];
  viewAllHref?: string;
  title?: string;
}) {
  const router = useRouter();
  return (
    <div className="stellog-card stellog-table-card">
      <div className="stellog-overview-card-head stellog-fleet-head">
        <h2>{title}</h2>
        {viewAllHref && (
          <a className="stellog-overview-link" href={viewAllHref}>
            View all
          </a>
        )}
      </div>
      <table className="stellog-table">
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
          {rows.map(row => (
            <tr
              key={row.id}
              className={row.href ? 'stellog-click' : undefined}
              onClick={() => {
                if (row.href) router.push(row.href);
              }}
            >
              <td>
                <Row gap="2" alignItems="center">
                  <Favicon domain={row.domain} />
                  {row.name}
                </Row>
              </td>
              <td>{formatLongNumber(row.pageviews)}</td>
              <td>{formatLongNumber(row.requests)}</td>
              <td>{row.requests === 0 ? '—' : formatRate(row.errorRate)}</td>
              <td>{formatLatency(row.p95, row.p95Capped)}</td>
              <td>
                <span className="stellog-trend">
                  <TrendSpark seed={row.id} growth={row.growth} />
                  {formatTrend(row.growth, row.current, row.previous)}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TrendSpark({ seed, growth }: { seed: string; growth: number | null }) {
  let hash = 0;
  for (const char of seed) hash = (hash * 33 + char.charCodeAt(0)) >>> 0;
  const direction = growth == null ? 0 : Math.sign(growth);
  const values = Array.from({ length: 12 }, (_, index) => {
    const wave = Math.sin((index + (hash % 5)) / 2) * 0.35;
    return 1 + wave + direction * (index / 11) * 0.8;
  });
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;
  const points = values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * 72;
      const y = 16 - ((value - min) / range) * 12;
      return `${x},${y}`;
    })
    .join(' ');
  return (
    <svg className="stellog-spark" width="72" height="18" viewBox="0 0 72 18" aria-hidden="true">
      <polyline points={points} fill="none" stroke="#71aeff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function formatRate(rate: number) {
  return `${Math.round(rate * 1000) / 10}%`;
}

export function formatLatency(ms: number | null | undefined, capped?: boolean) {
  if (capped) return '> 10s';
  if (ms == null) return '—';
  if (ms >= 1000) return `${Math.round(ms / 100) / 10}s`;
  return `${Math.round(ms)} ms`;
}

export function formatTrend(value: number | null, current: number, previous: number) {
  if (current === 0 && previous === 0) return '—';
  if (previous === 0 && current > 0) return 'new';
  const shown = displayedTrend(value);
  if (shown === null) return '—';
  const pct = Math.round(shown * 100);
  if (pct === 0) return '0%';
  return `${pct > 0 ? '+' : ''}${pct}%`;
}

export function trendOf(row: {
  requests: number;
  requestsPrevious: number;
  requestsGrowth: number | null;
  pageviews: number;
  pageviewsPrevious: number;
  pageviewsGrowth: number | null;
}) {
  const api = row.requests > 0 || row.requestsPrevious > 0;
  return api
    ? formatTrend(row.requestsGrowth, row.requests, row.requestsPrevious)
    : formatTrend(row.pageviewsGrowth, row.pageviews, row.pageviewsPrevious);
}
