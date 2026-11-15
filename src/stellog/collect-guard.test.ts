import { describe, expect, test } from 'vitest';
import {
  allowIp,
  decideCollect,
  IP_EVENT_LIMIT,
  IP_WINDOW_MS,
  issueNonce,
  NONCE_WINDOW_MS,
  originAllowed,
  verifyNonce,
} from './collect-guard';

const secret = 'test-secret';
const websiteId = '11111111-1111-1111-1111-111111111111';
const now = NONCE_WINDOW_MS * 20 + 5_000;

describe('collect nonce', () => {
  test('accepts the current and previous window for the same website', () => {
    const nonce = issueNonce(secret, websiteId, now);

    expect(verifyNonce(secret, websiteId, nonce, now)).toBe(true);
    expect(verifyNonce(secret, websiteId, nonce, now + NONCE_WINDOW_MS)).toBe(true);
    expect(verifyNonce(secret, websiteId, nonce, now + NONCE_WINDOW_MS * 2)).toBe(false);
  });

  test('rejects another website and a changed mac', () => {
    const nonce = issueNonce(secret, websiteId, now);
    const mac = nonce.slice(nonce.indexOf('.') + 1);

    expect(verifyNonce(secret, '22222222-2222-2222-2222-222222222222', nonce, now)).toBe(false);
    expect(
      verifyNonce(secret, websiteId, `${Math.floor(now / NONCE_WINDOW_MS)}.${mac}x`, now),
    ).toBe(false);
  });
});

describe('collect origin', () => {
  test('matches the website host and ignores the port and a www prefix', () => {
    expect(originAllowed('https://example.com:8443', null, 'example.com')).toBe(true);
    expect(originAllowed(null, 'https://www.example.com/docs', 'example.com')).toBe(true);
    expect(originAllowed('https://other.test', null, 'example.com')).toBe(false);
    expect(originAllowed(null, null, 'example.com')).toBe(false);
    expect(originAllowed('https://other.test', null, null)).toBe(true);
  });
});

describe('collect ip budget', () => {
  test('allows the chosen limit, then the next event, and resets after the window', () => {
    const store = new Map();

    for (let i = 0; i < IP_EVENT_LIMIT; i++) {
      expect(allowIp(store, 'ip-a', now)).toBe(true);
    }
    expect(allowIp(store, 'ip-a', now)).toBe(false);
    expect(allowIp(store, 'ip-b', now)).toBe(true);
    expect(allowIp(store, 'ip-a', now + IP_WINDOW_MS)).toBe(true);
  });

  test('counts a rejected nonce toward the same limit', () => {
    const store = new Map();
    const input = {
      now,
      secret,
      websiteId,
      domain: 'example.com',
      nonce: 'nope',
      origin: 'https://example.com',
      referer: null,
      userAgent: 'Mozilla/5.0 Chrome/120.0.0.0',
      ipHash: 'ip-a',
    };

    for (let i = 0; i < IP_EVENT_LIMIT; i++) {
      const decision = decideCollect(input, store);
      expect(decision.ok).toBe(false);
      if (decision.ok === false) expect(decision.reason).toBe('nonce');
    }
    expect(decideCollect({ ...input, nonce: issueNonce(secret, websiteId, now) }, store)).toEqual({
      ok: false,
      status: 429,
      reason: 'budget',
    });
  });
});

describe('collect decision', () => {
  test('rejects a bot before a pageview would be stored', () => {
    const decision = decideCollect(
      {
        now,
        secret,
        websiteId,
        domain: 'example.com',
        nonce: issueNonce(secret, websiteId, now),
        origin: 'https://example.com',
        referer: null,
        userAgent: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
        ipHash: 'bot',
      },
      new Map(),
    );

    expect(decision).toEqual({ ok: false, status: 200, reason: 'bot' });
  });
});
