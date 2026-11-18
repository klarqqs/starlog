import { expect, test } from 'vitest';
import {
  HIDDEN_WEBSITE_NAV,
  isReadOnlyOperator,
  operatorNav,
  PROJECT_NAV,
  PROJECT_REPORT_NAV,
  PROJECT_REPORT_SECTIONS,
} from './project-nav';

test('a Stellar account starts from its projects', () => {
  const ids = PROJECT_NAV.map(item => item.id);
  expect(ids).toEqual(['overview', 'projects', 'realtime', 'events', 'compare', 'settings']);
  expect(ids).not.toContain('dashboard');
  expect(ids).not.toContain('boards');
  expect(ids).not.toContain('links');
  expect(ids).not.toContain('pixels');
  expect(ids).not.toContain('websites');
  expect(ids).not.toContain('apis');
});

test('the operator shell keeps the account reports next to the SCF controls', () => {
  expect(operatorNav(false).map(item => item.id)).toEqual([
    'overview',
    'projects',
    'realtime',
    'events',
    'compare',
    'settings',
  ]);
  expect(operatorNav(true).map(item => item.id)).toEqual([
    'overview',
    'projects',
    'realtime',
    'events',
    'compare',
    'enrollment',
    'operator-keys',
    'operators',
    'security',
    'settings',
  ]);
  expect(PROJECT_NAV.map(item => item.id)).toContain('projects');
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
