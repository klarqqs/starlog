import { createHash, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bucketIndex, normalizePath, percentile, addBuckets, BOUNDS } from './metrics.js';
import { recordPageview, recordApi } from './rollup.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const tracker = readFileSync(join(root, 'collector/tracker.js'));
const pagePath = join(root, 'web/index.html');
const sha256 = (s) => createHash('sha256').update(s).digest();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function hostOf(origin) {
  try { return new URL(origin).hostname.toLowerCase(); } catch { return ''; }
}
function truncateIp(ip) {
  const raw = String(ip || '').replace(/^::ffff:/, '');
  if (raw.includes('.')) {
    const p = raw.split('.');
    return p.length === 4 ? `${p[0]}.${p[1]}.${p[2]}.0` : '0';
  }
  const p = raw.split(':').filter(Boolean);
  return p.length ? `${p.slice(0, 3).join(':')}::` : '0';
}
function browserOf(ua) {
  const s = String(ua || '');
  if (s.includes('Edg/')) return 'Edge';
  if (s.includes('Chrome/')) return 'Chrome';
  if (s.includes('Firefox/')) return 'Firefox';
  if (s.includes('Safari/')) return 'Safari';
  return 'Other';
}
function deviceOf(ua) {
  const s = String(ua || '');
  if (/iPad|Tablet/i.test(s)) return 'tablet';
  if (/Mobi|Android/i.test(s)) return 'mobile';
  return 'desktop';
}
function referrerHost(ref) {
  try { return new URL(ref).hostname.toLowerCase().slice(0, 120); } catch { return ''; }
}
function visitorHash(siteId, ip, ua) {
  const day = new Date().toISOString().slice(0, 10);
  return sha256(`${siteId}|${day}|${truncateIp(ip)}|${String(ua || '').slice(0, 200)}`);
}

export function registerProduct(app, { pools, tx, need }) {
  app.addContentTypeParser('text/plain', { parseAs: 'string' }, (req, body, done) => {
    try { done(null, body ? JSON.parse(body) : {}); }
    catch (e) { e.statusCode = 400; done(e); }
  });

  app.get('/s.js', async (req, reply) => {
    reply.type('text/javascript; charset=utf-8').header('cache-control', 'public, max-age=300');
    return tracker;
  });
  const page = (file) => readFileSync(join(root, 'web', file));
  const staticPages = { '/': 'home.html', '/docs': 'docs.html', '/pricing': 'pricing.html', '/privacy': 'privacy.html' };
  for (const [route, file] of Object.entries(staticPages)) {
    app.get(route, async (req, reply) => {
      reply.type('text/html; charset=utf-8').header('cache-control', 'public, max-age=300');
      return page(file);
    });
  }
  app.get('/site.css', async (req, reply) => {
    reply.type('text/css; charset=utf-8').header('cache-control', 'public, max-age=300');
    return page('site.css');
  });
  app.get('/wallet.js', async (req, reply) => {
    reply.type('text/javascript; charset=utf-8').header('cache-control', 'public, max-age=300');
    return page('wallet.js');
  });
  for (const route of ['/login', '/forgot', '/reset', '/app', '/operator', '/operator/login']) {
    app.get(route, async (req, reply) => {
      reply.type('text/html; charset=utf-8').header('cache-control', 'no-store');
      return readFileSync(pagePath);
    });
  }

  app.options('/collect', async (req, reply) => {
    reply.header('access-control-allow-origin', req.headers.origin || '*');
    reply.header('access-control-allow-methods', 'POST, OPTIONS');
    reply.header('access-control-allow-headers', 'content-type');
    reply.header('vary', 'Origin');
    return reply.code(204).send();
  });

  app.post('/collect', { config: { rateLimit: { max: 120, timeWindow: '1 minute' } } }, async (req, reply) => {
    const body = req.body || {};
    const site = String(body.site || '');
    if (!UUID.test(site)) return reply.code(400).send({ error: 'Unknown site.' });
    const { rows } = await pools.ingest.query('SELECT * FROM starlog.resolve_web_site($1)', [site]);
    const found = rows[0];
    if (!found) return reply.code(404).send({ error: 'Unknown site.' });
    const origin = req.headers.origin || '';
    if (hostOf(origin) !== found.domain) return reply.code(403).send({ error: 'This site is not registered for that domain.' });
    reply.header('access-control-allow-origin', origin);
    reply.header('vary', 'Origin');
    const ua = req.headers['user-agent'] || '';
    await tx(pools.ingest, found.tenant_id, (c) => recordPageview(c, site, {
      visitorHash: visitorHash(site, req.ip, ua),
      newSession: body.newSession === true,
      dims: [['referrer', referrerHost(body.referrer) || '(direct)'], ['browser', browserOf(ua)], ['device', deviceOf(ua)]],
    }));
    return reply.code(204).send();
  });

  app.post('/tenant/sites/:id/test', { preHandler: need('tenant') }, async (req, reply) => {
    if (!UUID.test(req.params.id)) return reply.code(400).send({ error: 'Unknown site.' });
    const owned = await tx(pools.tenant, req.user.tenant_id, async (c) =>
      (await c.query("SELECT id FROM starlog.sites WHERE id = $1 AND kind = 'web'", [req.params.id])).rows[0]);
    if (!owned) return reply.code(404).send({ error: 'Unknown site.' });
    await tx(pools.ingest, req.user.tenant_id, (c) => recordPageview(c, req.params.id, {
      visitorHash: randomBytes(32),
      newSession: true,
      dims: [['referrer', '(direct)'], ['browser', 'Other'], ['device', 'desktop']],
    }));
    return { recorded: true };
  });

  app.get('/tenant/tokens', { preHandler: need('tenant') }, async (req) =>
    tx(pools.tenant, req.user.tenant_id, async (c) => (await c.query('SELECT * FROM starlog.list_ingest_tokens()')).rows));

  app.post('/tenant/tokens', { preHandler: need('tenant') }, async (req, reply) => {
    const label = typeof (req.body || {}).label === 'string' ? req.body.label : '';
    const token = `sl_${randomBytes(32).toString('base64url')}`;
    const id = await tx(pools.tenant, req.user.tenant_id, async (c) =>
      (await c.query('SELECT starlog.create_ingest_token($1, $2) AS id', [sha256(token), label])).rows[0].id);
    return reply.code(201).send({ id, token });
  });

  app.post('/tenant/tokens/:id/revoke', { preHandler: need('tenant') }, async (req, reply) => {
    if (!UUID.test(req.params.id)) return reply.code(400).send({ error: 'Unknown token.' });
    const ok = await tx(pools.tenant, req.user.tenant_id, async (c) =>
      (await c.query('SELECT starlog.revoke_ingest_token($1) AS ok', [req.params.id])).rows[0].ok);
    return ok ? { revoked: true } : reply.code(404).send({ error: 'Unknown token.' });
  });

  app.get('/tenant/api/summary', { preHandler: need('tenant') }, async (req) => {
    const days = Math.min(Math.max(parseInt(req.query.days, 10) || 30, 1), 365);
    const rows = await tx(pools.tenant, req.user.tenant_id, async (c) =>
      (await c.query(
        `SELECT route, status_code::int AS status_code, requests::int AS requests, latency_buckets
           FROM starlog.api_hourly WHERE hour >= current_date - $1::int`, [days])).rows);
    const byRoute = new Map();
    for (const row of rows) {
      const cur = byRoute.get(row.route) || { route: row.route, requests: 0, errors: 0, buckets: BOUNDS.map(() => 0) };
      cur.requests += row.requests;
      if (row.status_code >= 400) cur.errors += row.requests;
      addBuckets(cur.buckets, row.latency_buckets);
      byRoute.set(row.route, cur);
    }
    const routes = [...byRoute.values()].map((r) => ({
      route: r.route,
      requests: r.requests,
      errorRate: r.requests ? Math.round(1000 * r.errors / r.requests) / 10 : 0,
      p50: percentile(r.buckets, 0.5),
      p95: percentile(r.buckets, 0.95),
    })).sort((a, b) => b.requests - a.requests);
    return { routes, totals: { requests: routes.reduce((a, r) => a + r.requests, 0) } };
  });

  app.post('/v1/metrics', { config: { rateLimit: { max: 600, timeWindow: '1 minute' } } }, async (req, reply) => {
    const header = String(req.headers.authorization || '');
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    if (!token) return reply.code(401).send({ error: 'Missing ingest token.' });
    const { rows } = await pools.ingest.query('SELECT starlog.resolve_ingest_token($1) AS tenant_id', [sha256(token)]);
    const tenantId = rows[0]?.tenant_id;
    if (!tenantId) return reply.code(401).send({ error: 'Unknown ingest token.' });
    const body = req.body || {};
    const domain = String(body.domain || '').toLowerCase();
    const points = Array.isArray(body.points) ? body.points.slice(0, 50) : [];
    if (!domain || !points.length) return reply.code(400).send({ error: 'Send a domain and a points array.' });
    const parsed = [];
    for (const point of points) {
      const status = Number(point.status);
      const latency = Number(point.latencyMs);
      const bucket = bucketIndex(latency);
      if (!Number.isInteger(status) || status < 100 || status > 599 || bucket < 0)
        return reply.code(400).send({ error: 'Each point needs a status code and a latency in milliseconds.' });
      parsed.push({ route: normalizePath(point.path), status, latency, bucket });
    }
    const accepted = await tx(pools.ingest, tenantId, async (c) => {
      const site = (await c.query("SELECT id FROM starlog.sites WHERE kind = 'api' AND domain = $1", [domain])).rows[0];
      if (!site) return null;
      for (const point of parsed) await recordApi(c, site.id, point);
      return parsed.length;
    });
    if (!accepted) return reply.code(404).send({ error: 'No API site is registered for that domain.' });
    return { accepted };
  });
}
