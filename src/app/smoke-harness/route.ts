import { TRACKER_INTEGRITY, trackerSrc, trackingSnippet } from '@/stellog/tracker-pin';

/**
 * Serves the pinned tracker snippet for scripts/smoke-test.ts.
 * Off unless SMOKE_HARNESS=1, so a normal start does not expose it.
 */
export function GET(request: Request) {
  if (process.env.SMOKE_HARNESS !== '1') return new Response('Not found', { status: 404 });

  const websiteId = new URL(request.url).searchParams.get('website');
  if (!websiteId) return new Response('Missing website', { status: 400 });

  const url = new URL(request.url);
  const host = request.headers.get('host');
  const origin = host ? `${url.protocol}//${host}` : url.origin;
  const snippet = trackingSnippet(trackerSrc(origin, '', null), TRACKER_INTEGRITY, websiteId);
  const html = `<!doctype html><html><head><title>smoke</title></head><body>${snippet}</body></html>\n`;
  return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } });
}
