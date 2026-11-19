import { describe, expect, test } from 'vitest';
import { activeFilterChips, filterProjects, type ProjectFilterRow, sortProjects } from './project-list-filters';

const rows: ProjectFilterRow[] = [
  project('Obba', { sites: 1, apis: 0, pageviews: 2372, requests: 0, errorRate: 0, p95: null, pageviewsGrowth: -0.05 }),
  project('Pipeline', { sites: 1, apis: 1, pageviews: 1500, requests: 86553, errorRate: 0.012, p95: 174, requestsGrowth: 0.18 }),
  project('Sorted', { sites: 1, apis: 1, pageviews: 900, requests: 14364, errorRate: 0.003, p95: 169, requestsGrowth: 0.35 }),
  project('Lucent', { sites: 1, apis: 1, pageviews: 400, requests: 22000, errorRate: 0.008, p95: 90, requestsGrowth: -0.03 }),
];

describe('project list filters', () => {
  test('site only keeps projects that have a site and no API', () => {
    const matched = filterProjects(rows, { fsrc: 'eq:site' }, '');
    expect(matched.map(row => row.name)).toEqual(['Obba']);
    expect(activeFilterChips({ fsrc: 'eq:site' })[0]).toMatchObject({
      label: 'Properties',
      operator: 'is',
      value: 'Site only',
    });
  });

  test('error rate over 1% excludes rows with no requests', () => {
    const matched = filterProjects(rows, { ferr: 'gt:0.01' }, '');
    expect(matched.map(row => row.name)).toEqual(['Pipeline']);
  });

  test('search and filters combine, and sort still orders the matches', () => {
    const matched = sortProjects(
      filterProjects(rows, { ftrend: 'gt:0', fpv: '500:' }, 'p'),
      'requests',
      'asc',
    );
    expect(matched.map(row => row.name)).toEqual(['Pipeline']);
  });

  test('a range that nothing meets is empty', () => {
    expect(filterProjects(rows, { fp95: 'lt:100', ftrend: 'lt:0' }, '').map(row => row.name)).toEqual(['Lucent']);
    expect(filterProjects(rows, { freq: '1000000:' }, '')).toEqual([]);
  });
});

function project(name: string, extra: Partial<ProjectFilterRow>): ProjectFilterRow {
  return {
    name,
    sites: 0,
    apis: 0,
    pageviews: 0,
    visitors: 0,
    requests: 0,
    errorRate: 0,
    p95: null,
    requestsGrowth: null,
    pageviewsGrowth: null,
    requestsPrevious: 100,
    pageviewsPrevious: 100,
    ...extra,
  };
}
