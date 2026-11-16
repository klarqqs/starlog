import { expect, test } from 'vitest';
import { chartUnit, emptyWeekly, sqlTimezone } from './project-window';

test('only a plain timezone name is interpolated', () => {
  expect(sqlTimezone('America/Los_Angeles')).toBe('America/Los_Angeles');
  expect(sqlTimezone('UTC')).toBe('UTC');
  expect(sqlTimezone("UTC'; drop table website_event;--")).toBe('UTC');
  expect(sqlTimezone(undefined)).toBe('UTC');
});

test('chart buckets stay on the formats Postgres can emit', () => {
  expect(chartUnit('hour')).toBe('hour');
  expect(chartUnit('week')).toBe('day');
  expect(chartUnit(undefined)).toBe('day');
});

test('a weekly grid has seven days and twenty-four hours', () => {
  const days = emptyWeekly();
  expect(days).toHaveLength(7);
  expect(days.every(hours => hours.length === 24 && hours.every(value => value === 0))).toBe(true);
});
