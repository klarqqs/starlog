'use client';

import { useCallback, useMemo, useState } from 'react';
import { Chart } from '@/components/charts/Chart';
import { useLocale } from '@/components/hooks';
import { DATE_FORMATS, formatDate, generateTimeSeries } from '@/lib/date';
import { formatLongNumber } from '@/lib/format';
import { renderDateLabels } from '@/lib/charts';

type Point = { t: string; site: number; visitors?: number; api?: number };
type Metric = 'api' | 'pageviews';

const LINE = '#71aeff';

const crosshairPlugin = {
  id: 'stellogOverviewCrosshair',
  afterDatasetsDraw(chart: { ctx: CanvasRenderingContext2D; chartArea: { top: number; bottom: number }; getActiveElements: () => Array<{ element: { x: number } }> }) {
    const active = chart.getActiveElements()[0];
    if (!active) return;
    const { ctx, chartArea } = chart;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(active.element.x, chartArea.top);
    ctx.lineTo(active.element.x, chartArea.bottom);
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(255,255,255,0.28)';
    ctx.stroke();
    ctx.restore();
  },
};

/** One line for the operator overview. The title follows the selected metric. */
export function TrafficChart({
  points,
  start,
  end,
  unit,
}: {
  points: Point[];
  start: Date;
  end: Date;
  unit: string;
}) {
  const { locale } = useLocale();
  const [metric, setMetric] = useState<Metric>('api');
  const [tooltip, setTooltip] = useState<{ x: number; y: number; title: string; value: string } | null>(null);
  const hourly = unit === 'hour' || unit === 'minute';
  const title = `${metric === 'api' ? 'Requests' : 'Pageviews'} per ${hourly ? 'hour' : 'day'}`;
  const renderXLabel = useMemo(() => renderDateLabels(unit, locale), [unit, locale]);

  const chartData = useMemo(() => {
    const series = points.map(point => ({
      x: point.t,
      y: metric === 'api' ? point.api || 0 : point.site || 0,
    }));
    return {
      datasets: [
        {
          label: '',
          data: generateTimeSeries(series, start, end, unit, locale),
          borderColor: LINE,
          backgroundColor: 'rgba(113, 174, 255, 0.10)',
          borderWidth: 2,
          pointRadius: 0,
          pointHoverRadius: 3,
          tension: 0.35,
          fill: true,
          spanGaps: true,
        },
      ],
    };
  }, [points, metric, start, end, unit, locale]);

  const onTooltip = useCallback((model: { tooltip?: { opacity: number; caretX: number; caretY: number; dataPoints?: Array<{ raw?: { x?: string; y?: number | null } }> } }) => {
    const tip = model.tooltip;
    const point = tip?.dataPoints?.[0];
    if (!tip?.opacity || !point) {
      setTooltip(null);
      return;
    }
    const value = point.raw?.y;
    setTooltip({
      x: tip.caretX,
      y: tip.caretY,
      title: String(point.raw?.x || ''),
      value: value == null ? '—' : formatLongNumber(value),
    });
  }, []);

  const chartOptions = useMemo(
    () => ({
      interaction: { mode: 'index' as const, intersect: false },
      plugins: { tooltip: { intersect: false } },
      scales: {
        x: {
          type: 'timeseries' as const,
          min: formatDate(start, DATE_FORMATS[unit], locale),
          max: formatDate(end, DATE_FORMATS[unit], locale),
          offset: true,
          grid: { display: false },
          border: { display: false },
          ticks: {
            color: 'rgba(255,255,255,0.55)',
            maxRotation: 0,
            autoSkip: true,
            font: { family: 'system-ui, -apple-system, "Segoe UI", sans-serif' },
            callback: renderXLabel,
          },
        },
        y: {
          min: 0,
          beginAtZero: true,
          grid: { color: 'rgba(255,255,255,0.06)' },
          border: { display: false },
          ticks: {
            color: 'rgba(255,255,255,0.55)',
            maxTicksLimit: 6,
            font: { family: 'system-ui, -apple-system, "Segoe UI", sans-serif' },
            callback: (value: number) => formatLongNumber(Number(value)),
          },
        },
      },
    }),
    [start, end, unit, locale, renderXLabel],
  );

  return (
    <section className="stellog-card stellog-chart-card">
      <header>
        <h2>{title}</h2>
        <div className="stellog-segment" role="group" aria-label="Chart metric">
          <button type="button" aria-pressed={metric === 'api'} onClick={() => setMetric('api')}>
            API requests
          </button>
          <button type="button" aria-pressed={metric === 'pageviews'} onClick={() => setMetric('pageviews')}>
            Pageviews
          </button>
        </div>
      </header>
      <div className="stellog-compare-plot">
        <Chart
          type="line"
          height="280px"
          chartData={chartData}
          chartOptions={chartOptions}
          animationDuration={0}
          onTooltip={onTooltip}
          chartPlugins={[crosshairPlugin]}
        />
        {tooltip && (
          <div className="stellog-compare-tooltip" style={{ left: tooltip.x + 12, top: tooltip.y }}>
            <strong>{tooltip.title}</strong>
            <div>{tooltip.value}</div>
          </div>
        )}
      </div>
    </section>
  );
}
