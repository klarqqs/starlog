import { createHmac, timingSafeEqual } from 'node:crypto';
import { isbot } from 'isbot';

/** How long an issued nonce stays valid, plus the previous window. A Stellog choice. */
export const NONCE_WINDOW_MS = 5 * 60 * 1000;

/** Events one IP may send per window on the pinned collect path. A Stellog choice. */
export const IP_EVENT_LIMIT = 60;

export const IP_WINDOW_MS = 60 * 1000;

export type IpBudget = Map<string, { start: number; count: number }>;

export type GuardDecision =
  | { ok: true }
  | { ok: false; status: number; reason: 'bot' | 'nonce' | 'origin' | 'budget' | 'website' };

export function issueNonce(secret: string, websiteId: string, now: number) {
  const bucket = Math.floor(now / NONCE_WINDOW_MS);
  return `${bucket}.${sign(secret, websiteId, bucket)}`;
}

export function verifyNonce(secret: string, websiteId: string, nonce: string, now: number) {
  const splitAt = nonce.indexOf('.');
  if (splitAt <= 0) return false;
  const bucket = Number(nonce.slice(0, splitAt));
  const mac = nonce.slice(splitAt + 1);
  if (!mac || !Number.isInteger(bucket)) return false;
  const current = Math.floor(now / NONCE_WINDOW_MS);
  if (bucket !== current && bucket !== current - 1) return false;
  const expected = sign(secret, websiteId, bucket);
  const left = Buffer.from(mac);
  const right = Buffer.from(expected);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function originAllowed(
  origin: string | null,
  referer: string | null,
  domain: string | null,
) {
  const expected = siteHost(domain);
  if (!expected) return true;
  const host = headerHost(origin) || headerHost(referer);
  if (!host) return false;
  return host.replace(/^www\./, '') === expected;
}

export function allowIp(store: IpBudget, ipHash: string, now: number) {
  const current = store.get(ipHash);
  if (!current || now - current.start >= IP_WINDOW_MS) {
    store.set(ipHash, { start: now, count: 1 });
    return true;
  }
  if (current.count >= IP_EVENT_LIMIT) return false;
  current.count += 1;
  return true;
}

export function decideCollect(
  input: {
    now: number;
    secret: string;
    websiteId: string | null;
    domain: string | null;
    nonce: string | null;
    origin: string | null;
    referer: string | null;
    userAgent: string | null;
    ipHash: string;
  },
  store: IpBudget,
): GuardDecision {
  if (!input.websiteId) return { ok: false, status: 400, reason: 'website' };
  // Every POST attempt counts, including a rejected nonce or origin. GET nonce issuance does not.
  if (!allowIp(store, input.ipHash, input.now)) {
    return { ok: false, status: 429, reason: 'budget' };
  }
  if (!process.env.DISABLE_BOT_CHECK && isbot(input.userAgent || '')) {
    return { ok: false, status: 200, reason: 'bot' };
  }
  if (!input.nonce || !verifyNonce(input.secret, input.websiteId, input.nonce, input.now)) {
    return { ok: false, status: 403, reason: 'nonce' };
  }
  if (!originAllowed(input.origin, input.referer, input.domain)) {
    return { ok: false, status: 403, reason: 'origin' };
  }
  return { ok: true };
}

function sign(secret: string, websiteId: string, bucket: number) {
  return createHmac('sha256', secret).update(`${websiteId}.${bucket}`).digest('base64url');
}

function siteHost(domain: string | null) {
  if (!domain) return null;
  const trimmed = domain.trim().toLowerCase();
  if (!trimmed) return null;
  try {
    const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    return new URL(withProtocol).hostname.replace(/\.$/, '').replace(/^www\./, '');
  } catch {
    return null;
  }
}

function headerHost(value: string | null) {
  if (!value) return null;
  try {
    return new URL(value).hostname.replace(/\.$/, '').toLowerCase();
  } catch {
    return null;
  }
}
