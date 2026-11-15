import { describe, expect, test } from 'vitest';
import {
  aggregateCutoff,
  aggregateRetentionMonths,
  rawCutoff,
  rawRetentionHours,
} from './retention';

describe('retention windows', () => {
  const now = new Date('2026-11-15T18:00:00.000Z');

  test('raw retention defaults to 48 hours and is configurable', () => {
    expect(rawRetentionHours({})).toBe(48);
    expect(rawCutoff(now, { STELLOG_RAW_RETENTION_HOURS: '6' }).toISOString()).toBe(
      '2026-11-15T12:00:00.000Z',
    );
  });

  test('raw retention rejects a non-positive window', () => {
    expect(() => rawRetentionHours({ STELLOG_RAW_RETENTION_HOURS: '0' })).toThrow(
      /STELLOG_RAW_RETENTION_HOURS/,
    );
  });

  test('aggregate retention is at least 24 calendar months', () => {
    expect(aggregateRetentionMonths({})).toBe(24);
    expect(aggregateRetentionMonths({ STELLOG_AGGREGATE_RETENTION_MONTHS: '3' })).toBe(24);
    expect(aggregateCutoff(now, {}).toISOString()).toBe('2024-11-15T18:00:00.000Z');
    expect(aggregateRetentionMonths({ STELLOG_AGGREGATE_RETENTION_MONTHS: '36' })).toBe(36);
  });
});
