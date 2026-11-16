import { expect, test } from 'vitest';
import {
  HIDDEN_WEBSITE_NAV,
  isReadOnlyOperator,
  operatorNav,
  operatorViewNav,
  PROJECT_NAV,
  PROJECT_REPORT_NAV,
  PROJECT_REPORT_SECTIONS,
} from './project-nav';

test('a Stellar project does not list Umami product tabs', () => {
  const ids = PROJECT_NAV.map(item => item.id);
  expect(ids).toEqual(['overview', 'websites', 'apis', 'setup', 'settings']);
  expect(ids).not.toContain('dashboard');
  expect(ids).not.toContain('boards');
  expect(ids).not.toContain('links');
  expect(ids).not.toContain('pixels');
});

test('a read-only operator sees the project views and the ranking', () => {
  expect(operatorNav(false).map(item => item.id)).toEqual(['projects']);
  expect(operatorViewNav().map(item => item.id)).toEqual([
    'overview',
    'projects',
    'websites',
    'apis',
    'setup',
    'settings',
  ]);
  expect(operatorNav(true).map(item => item.id)).toEqual([
    'projects',
    'enrollment',
    'operator-keys',
    'operators',
    'security',
  ]);
  expect(isReadOnlyOperator({ role: 'operator', isOperator: true })).toBe(true);
  expect(isReadOnlyOperator({ role: 'admin', isAdmin: true, isOperator: false })).toBe(false);
});

test('project reports follow the website sections and skip the hidden ones', () => {
  const ids = PROJECT_REPORT_NAV.flatMap(group => group.items.map(item => item.id));
  expect(ids).toEqual([
    'events',
    'sessions',
    'compare',
    'breakdown',
    'goals',
    'funnels',
    'journeys',
    'retention',
    'segments',
    'cohorts',
    'utm',
    'attribution',
    'realtime',
    'performance',
    'errors',
    'api',
  ]);
  expect(PROJECT_REPORT_SECTIONS).not.toContain('api');
  for (const hidden of HIDDEN_WEBSITE_NAV) {
    expect(ids).not.toContain(hidden);
  }
});

test('website navigation hides the sections outside the RFP', () => {
  expect([...HIDDEN_WEBSITE_NAV]).toEqual([
    'replays',
    'heatmaps',
    'revenue',
    'search-console',
    'google-ads',
  ]);
});
