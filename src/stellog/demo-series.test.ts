import { describe, expect, test } from 'vitest';
import { DEMO_PROJECTS } from '../../scripts/demo-projects';
import {
  demoPoint,
  displayedTrend,
  errorRateFor,
  HISTORY_DAYS,
  isSlowProject,
  latencyOf,
  projectLatency,
  routeLatency,
  stableUuid,
  trendTarget,
  windowGrowth,
  windowTotals,
} from './demo-series';

const NOW = new Date('2026-11-18T18:00:00Z');
const synthetic = DEMO_PROJECTS.map((project, index) => ({ ...project, index })).filter(
  project => project.name !== 'Obba',
);

function kindFor(): 'both' {
  return 'both';
}

describe('demo series', () => {
  test('gives every project its own volume', () => {
    const views = synthetic.map(project =>
      windowTotals(project.name, project.index, kindFor(), 30, 0, NOW).pageviews,
    );
    const requests = synthetic.map(project =>
      windowTotals(project.name, project.index, kindFor(), 30, 0, NOW).requests,
    );
    expect(views.every(value => value > 0)).toBe(true);
    expect(requests.every(value => value > 0)).toBe(true);
    expect(new Set(views).size).toBe(views.length);
    expect(new Set(requests).size).toBe(requests.length);
    expect(synthetic.filter(project => project.name === 'Obba')).toHaveLength(0);
  });

  test('keeps a full previous window and a sane trend', () => {
    expect(HISTORY_DAYS).toBeGreaterThanOrEqual(365 * 2);
    for (const project of synthetic) {
      const kind = kindFor();
      for (const days of [30, 90, 365]) {
        const growth = windowGrowth(project.name, project.index, kind, days, NOW);
        expect(growth).not.toBeNull();
        expect(growth!).toBeGreaterThanOrEqual(-0.08);
        expect(growth!).toBeLessThanOrEqual(0.4);
      }
    }
  });

  test('keeps errors and latency in the presentation range', () => {
    const slow = synthetic.filter(project => isSlowProject(project.name));
    expect(slow.map(project => project.name).sort()).toEqual(['JetPad', 'Liqvid']);
    for (const project of synthetic) {
      expect(errorRateFor(project.index)).toBeGreaterThanOrEqual(0.003);
      expect(errorRateFor(project.index)).toBeLessThanOrEqual(0.013);
      const totals = windowTotals(project.name, project.index, 'both', 90, 0, NOW);
      expect(totals.rate).toBeGreaterThanOrEqual(0.002);
      expect(totals.rate).toBeLessThanOrEqual(0.015);
      const latency = projectLatency(project.name);
      expect(latency.p50).toBeGreaterThanOrEqual(20);
      expect(latency.p50).toBeLessThanOrEqual(45);
      expect(latency.p95).toBeGreaterThanOrEqual(70);
      expect(latency.p95).toBeLessThan(250);
      const recovered = latencyOf(1000, latency.p50, latency.p95);
      expect(recovered.p50).toBeGreaterThan(15);
      expect(recovered.p95).toBeLessThan(1000);
      const health = routeLatency(project.name, '/health');
      const payments = routeLatency(project.name, '/payments/{id}');
      expect(health.p50).toBeLessThan(payments.p50);
      expect(health.p95).toBeLessThan(payments.p95);
    }
  });

  test('gives a busier site more API calls', () => {
    for (const project of synthetic) {
      const point = demoPoint(project.name, project.index, 'both', HISTORY_DAYS - 1, NOW);
      expect(point.requests).toBeGreaterThan(point.pageviews);
      expect(point.pageviews).toBeGreaterThan(0);
    }
  });

  test('spreads 30-day trends across projects', () => {
    const trends = synthetic.map(project => trendTarget(project.name));
    expect(Math.min(...trends)).toBeLessThan(-0.02);
    expect(Math.max(...trends)).toBeGreaterThan(0.2);
  });

  test('reloads the same ids and clamps a wild trend for display', () => {
    expect(stableUuid('team:Sorted')).toBe(stableUuid('team:Sorted'));
    expect(stableUuid('team:Sorted')).not.toBe(stableUuid('team:Tilt Pay'));
    expect(displayedTrend(8.7)).toBe(0.4);
    expect(displayedTrend(-0.5)).toBe(-0.08);
    expect(displayedTrend(0.12)).toBe(0.12);
    expect(displayedTrend(null)).toBeNull();
  });
});
