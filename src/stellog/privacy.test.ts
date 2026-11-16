import { describe, expect, test } from 'vitest';
import { resolveCollectionSession } from '@/lib/collection-session';
import { getSalt } from '@/lib/crypto';
import { truncateIp } from './privacy';

describe('truncateIp', () => {
  test('zeroes the last IPv4 octet and the IPv6 host bits', () => {
    expect(truncateIp('203.0.113.42')).toBe('203.0.113.0');
    expect(truncateIp('2001:db8:abcd:12::7')).toBe('2001:db8:abcd::');
    expect(truncateIp('not-an-ip')).toBeUndefined();
    expect(truncateIp(undefined)).toBeUndefined();
  });

  test('a day salt is not the monthly default', () => {
    process.env.APP_SECRET = 'privacy-test-secret';
    const createdAt = new Date('2026-11-15T18:00:00.000Z');
    const day = resolveCollectionSession({
      sourceId: 'site',
      ip: '203.0.113.0',
      userAgent: 'ua',
      createdAt,
      saltRotation: 'day',
    });
    const month = resolveCollectionSession({
      sourceId: 'site',
      ip: '203.0.113.0',
      userAgent: 'ua',
      createdAt,
      saltRotation: 'month',
    });
    expect(day.sessionId).not.toBe(month.sessionId);
    expect(getSalt('day', createdAt)).not.toBe(getSalt('month', createdAt));
  });
});
