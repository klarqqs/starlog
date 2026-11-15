const ACCOUNT = /^G[A-Z2-7]{55}$/;
const CONTRACT = /^C[A-Z2-7]{55}$/;
const MUXED = /^M[A-Z2-7]{68}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HASH_RE = /^(?:0x)?[0-9a-f]{32,128}$/i;

export const ROUTE_MAX_LENGTH = 500;

function isHash(segment: string): boolean {
  if (!HASH_RE.test(segment)) return false;
  const hex = segment.slice(0, 2).toLowerCase() === '0x' ? segment.slice(2) : segment;
  return hex.length % 2 === 0;
}

function decodeSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

function normalizeSegment(segment: string): string {
  if (ACCOUNT.test(segment)) return '{account}';
  if (CONTRACT.test(segment)) return '{contract}';
  if (MUXED.test(segment)) return '{muxed}';
  if (UUID_RE.test(segment)) return '{uuid}';
  if (isHash(segment)) return '{hash}';
  if (/^\d+$/.test(segment)) return '{id}';
  return segment;
}

/**
 * Collapse a URL path to a stable route.
 * Query strings and fragments are removed. A trailing slash is removed.
 * Path segments that are Stellar G, C, or M addresses, UUIDs, hex hashes,
 * or decimal ids are replaced. A value the caller already templated, such as
 * `{id}`, is left as written.
 */
export function normalizeRoute(input: string | null | undefined): string {
  const trimmed = input?.trim() ?? '';
  if (!trimmed) return '/';

  let path = trimmed;
  if (/^https?:\/\//i.test(path)) {
    try {
      path = new URL(path).pathname;
    } catch {
      // Keep the original text and strip the query below.
    }
  }

  path = path.split('#')[0]?.split('?')[0] ?? '';
  if (path.length > 1) path = path.replace(/\/+$/, '');

  const segments = path
    .split('/')
    .filter(segment => segment.length > 0)
    .map(segment => normalizeSegment(decodeSegment(segment)));

  const route = `/${segments.join('/')}`;
  if (route.length <= ROUTE_MAX_LENGTH) return route;
  return route.slice(0, ROUTE_MAX_LENGTH);
}

/**
 * Prefer the tenant's http.route when it is present. The chosen value still
 * passes through the default normalizer, so a raw address pasted into
 * http.route is collapsed, and a template such as `/payments/{id}` is kept.
 */
export function resolveHttpRoute(input: { route?: string | null; path?: string | null }): string {
  const chosen = input.route?.trim() ? input.route : input.path;
  return normalizeRoute(chosen);
}
