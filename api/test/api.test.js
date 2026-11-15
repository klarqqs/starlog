import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { hash } from '@node-rs/argon2';
import { buildApp } from '../src/app.js';

const mk = (k) => new pg.Pool({ connectionString: process.env[k], max: 4 });
const pools = { auth: mk('AUTH_DATABASE_URL'), tenant: mk('TENANT_DATABASE_URL'), operator: mk('OPERATOR_DATABASE_URL'), ingest: mk('INGEST_DATABASE_URL') };
const admin = mk('ADMIN_DATABASE_URL');
const mails = [];
const mailer = { async send(m) { mails.push(m); } };
const app = await buildApp({ pools, mailer, config: { loginPerMinute: 1000, allowedOrigin: 'https://app.test' } });
test.after(async () => { await app.close(); await Promise.all([...Object.values(pools), admin].map((p) => p.end())); });

const PW = 'correct-horse-battery';
const post = (url, payload, headers = {}) => app.inject({ method: 'POST', url, payload, headers });
const cookieOf = (res) => (res.headers['set-cookie'] || '').split(';')[0];
const get = (url, cookie) => app.inject({ method: 'GET', url, headers: cookie ? { cookie } : {} });

async function signUp(project, email) {
  const r = await post('/auth/register', { project, email, password: PW });
  assert.equal(r.statusCode, 201);
  const link = mails.at(-1).link;
  assert.equal((await get(link.replace('http://localhost:4000', ''))).statusCode, 200);
  const l = await post('/auth/login', { email, password: PW });
  assert.equal(l.statusCode, 200);
  const tenantId = (await admin.query('SELECT tenant_id FROM starlog.users WHERE email=$1', [email])).rows[0].tenant_id;
  return { cookie: cookieOf(l), tenantId };
}
async function seedViews(tenantId, views) {
  const site = (await admin.query("INSERT INTO starlog.sites (tenant_id,kind,domain) VALUES ($1,'web',$2) RETURNING id", [tenantId, `${views}.seed.test`])).rows[0].id;
  await admin.query('INSERT INTO starlog.web_daily (tenant_id,site_id,day,page_views,visitors) VALUES ($1,$2,current_date,$3,$3)', [tenantId, site, views]);
}

let A, B;
test('register, block unverified login, verify, then sign in', async () => {
  assert.equal((await post('/auth/register', { project: 'Alpha Wallet', email: 'a@alpha.test', password: PW })).statusCode, 201);
  assert.equal((await post('/auth/login', { email: 'a@alpha.test', password: PW })).statusCode, 403);
  assert.equal((await get('/auth/verify?token=bogus')).statusCode, 400);
  assert.equal((await get(mails.at(-1).link.replace('http://localhost:4000', ''))).statusCode, 200);
  const l = await post('/auth/login', { email: 'a@alpha.test', password: PW });
  assert.equal(l.statusCode, 200);
  A = { cookie: cookieOf(l), tenantId: (await admin.query("SELECT tenant_id FROM starlog.users WHERE email='a@alpha.test'")).rows[0].tenant_id };
  const me = await get('/me', A.cookie);
  assert.equal(me.json().role, 'tenant');
});
test('verification links work only once', async () => {
  assert.equal((await get(mails[0].link.replace('http://localhost:4000', ''))).statusCode, 400);
});
test('stores only argon2id hashes, never the password', async () => {
  const h = (await admin.query("SELECT password_hash FROM starlog.users WHERE email='a@alpha.test'")).rows[0].password_hash;
  assert.match(h, /^\$argon2id\$/); assert.ok(!h.includes(PW));
});
test('wrong password and unknown email give the same answer', async () => {
  const a = await post('/auth/login', { email: 'a@alpha.test', password: 'wrong-password-1' });
  const b = await post('/auth/login', { email: 'nobody@x.test', password: 'wrong-password-1' });
  assert.equal(a.statusCode, 401); assert.equal(b.statusCode, 401); assert.equal(a.body, b.body);
});
test('rejects duplicate email, weak password, bad email', async () => {
  assert.equal((await post('/auth/register', { project: 'Dup', email: 'A@ALPHA.test', password: PW })).statusCode, 409);
  assert.equal((await post('/auth/register', { project: 'Weak', email: 'w@x.test', password: 'short' })).statusCode, 400);
  assert.equal((await post('/auth/register', { project: 'Bad', email: 'nope', password: PW })).statusCode, 400);
});
test('tenant isolation through the API', async () => {
  B = await signUp('Beta Pay', 'b@beta.test');
  await seedViews(A.tenantId, 111); await seedViews(B.tenantId, 999);
  const a = (await get('/tenant/web/summary', A.cookie)).json();
  const b = (await get('/tenant/web/summary', B.cookie)).json();
  assert.equal(a.totals.pageViews, 111); assert.equal(b.totals.pageViews, 999);
  const sitesA = (await get('/tenant/sites', A.cookie)).json();
  assert.ok(sitesA.every((s) => s.domain.startsWith('111')));
});
test('role guards: anonymous 401, tenant on operator route 403', async () => {
  assert.equal((await get('/tenant/sites')).statusCode, 401);
  assert.equal((await get('/operator/tenants', A.cookie)).statusCode, 403);
});
test('site input is validated and duplicates are refused', async () => {
  assert.equal((await post('/tenant/sites', { kind: 'web', domain: "x'; DROP TABLE users;--" }, { cookie: A.cookie })).statusCode, 400);
  assert.equal((await post('/tenant/sites', { kind: 'web', domain: 'app.alpha.test' }, { cookie: A.cookie })).statusCode, 201);
  assert.equal((await post('/tenant/sites', { kind: 'web', domain: 'app.alpha.test' }, { cookie: A.cookie })).statusCode, 409);
});
test('a visit is counted only for the site owner', async () => {
  const created = await post('/tenant/sites', { kind: 'web', domain: 'app.beta.test' }, { cookie: B.cookie });
  assert.equal(created.statusCode, 201);
  const site = created.json().id;
  const headers = { origin: 'https://app.beta.test', 'content-type': 'application/json', 'user-agent': 'Mozilla/5.0 Chrome/120.0' };
  assert.equal((await app.inject({ method: 'POST', url: '/collect', headers, payload: { site, path: '/docs', referrer: 'https://stellar.org/grants', newSession: true } })).statusCode, 204);
  assert.equal((await app.inject({ method: 'POST', url: '/collect', headers, payload: { site, path: '/docs', referrer: 'https://stellar.org/grants', newSession: false } })).statusCode, 204);
  assert.equal((await app.inject({ method: 'POST', url: '/collect', headers: { ...headers, origin: 'https://evil.test' }, payload: { site, path: '/x' } })).statusCode, 403);
  const b = (await get('/tenant/web/summary', B.cookie)).json();
  const a = (await get('/tenant/web/summary', A.cookie)).json();
  assert.equal(b.totals.pageViews, 1001);
  assert.equal(b.totals.visitors, 1000);
  assert.equal(b.breakdown.referrer[0].key, 'stellar.org');
  assert.equal(a.totals.pageViews, 111);
  assert.equal(a.breakdown.referrer.some((r) => r.key === 'stellar.org'), false);
});
test('api metrics keep a normalized route and stay inside the tenant', async () => {
  assert.equal((await post('/tenant/sites', { kind: 'api', domain: 'api.beta.test' }, { cookie: B.cookie })).statusCode, 201);
  const tok = await post('/tenant/tokens', { label: 'ci' }, { cookie: B.cookie });
  assert.equal(tok.statusCode, 201);
  const account = `G${'A'.repeat(55)}`;
  const sent = await app.inject({
    method: 'POST', url: '/v1/metrics',
    headers: { authorization: `Bearer ${tok.json().token}`, 'content-type': 'application/json' },
    payload: { domain: 'api.beta.test', points: [
      { path: `/accounts/${account}/payments`, status: 200, latencyMs: 42 },
      { path: `/accounts/${account}/payments`, status: 500, latencyMs: 900 },
    ] },
  });
  assert.equal(sent.statusCode, 200);
  assert.equal(sent.json().accepted, 2);
  const route = (await get('/tenant/api/summary', B.cookie)).json().routes.find((r) => r.route === '/accounts/:id/payments');
  assert.equal(route.requests, 2);
  assert.equal(route.errorRate, 50);
  assert.equal(route.p50, 50);
  assert.equal(route.p95, 1000);
  assert.equal((await get('/tenant/api/summary', A.cookie)).json().totals.requests, 0);
  assert.equal((await app.inject({ method: 'POST', url: '/v1/metrics', headers: { authorization: 'Bearer nope', 'content-type': 'application/json' }, payload: { domain: 'api.beta.test', points: [{ path: '/', status: 200, latencyMs: 1 }] } })).statusCode, 401);
});
test('share link: off by default, on when enabled, off again when revoked', async () => {
  const slug = (await admin.query('SELECT slug FROM starlog.tenants WHERE id=$1', [A.tenantId])).rows[0].slug;
  assert.equal((await get(`/share/${slug}`)).statusCode, 404);
  const on = await app.inject({ method: 'PATCH', url: '/tenant/share', payload: { enabled: true }, headers: { cookie: A.cookie } });
  assert.equal(on.json().sharePath, `/share/${slug}`);
  const s = await get(`/share/${slug}`);
  assert.equal(s.statusCode, 200); assert.equal(Number(s.json().page_views), 111);
  assert.ok(!('tenant_id' in s.json()));
  await app.inject({ method: 'PATCH', url: '/tenant/share', payload: { enabled: false }, headers: { cookie: A.cookie } });
  assert.equal((await get(`/share/${slug}`)).statusCode, 404);
});
test('cross-origin writes are blocked', async () => {
  assert.equal((await post('/tenant/sites', { kind: 'web', domain: 'evil.alpha.test' }, { cookie: A.cookie, origin: 'https://evil.test' })).statusCode, 403);
});
test('operator sees all tenants, removing one locks it out immediately', async () => {
  await admin.query("INSERT INTO starlog.users (tenant_id,email,password_hash,role,email_verified_at) VALUES (NULL,'op@scf.test',$1,'operator',now())", [await hash(PW)]);
  const l = await post('/auth/login', { email: 'op@scf.test', password: PW });
  const op = cookieOf(l);
  const list = (await get('/operator/tenants', op)).json();
  assert.ok(list.length >= 2);
  assert.equal(list.find((t) => t.id === A.tenantId).page_views, 111);
  assert.equal((await get('/tenant/sites', op)).statusCode, 403);
  assert.equal((await post('/operator/tenants/not-a-uuid/remove', {}, { cookie: op })).statusCode, 400);
  assert.equal((await post(`/operator/tenants/${A.tenantId}/remove`, {}, { cookie: op })).statusCode, 200);
  assert.equal((await get('/me', A.cookie)).statusCode, 401);
  assert.equal((await post('/auth/login', { email: 'a@alpha.test', password: PW })).statusCode, 401);
});
test('logout ends the session', async () => {
  assert.equal((await get('/me', B.cookie)).statusCode, 200);
  await post('/auth/logout', {}, { cookie: B.cookie });
  assert.equal((await get('/me', B.cookie)).statusCode, 401);
});
test('login is rate limited', async () => {
  const strict = await buildApp({ pools, mailer, config: { loginPerMinute: 3 } });
  const codes = [];
  for (let i = 0; i < 5; i++) codes.push((await strict.inject({ method: 'POST', url: '/auth/login', payload: { email: 'x@x.test', password: 'whatever-123' } })).statusCode);
  assert.deepEqual(codes, [401, 401, 401, 429, 429]);
  await strict.close();
});
