import Fastify from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { hash as argonHash, verify as argonVerify } from '@node-rs/argon2';
import { createHash, randomBytes } from 'node:crypto';
import { registerProduct } from './product.js';
import { validPublicKey, verifySignedMessage } from './wallet.js';

const sha256 = (s) => createHash('sha256').update(s).digest();
const newToken = () => randomBytes(32).toString('base64url');
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;
const DOMAIN = /^(?=.{3,253}$)([a-z0-9-]+\.)+[a-z]{2,}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const COOKIE = 'sl_session';

// Run fn in a transaction with the tenant context set, so Postgres row-level security applies.
async function tx(pool, tenantId, fn) {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    if (tenantId) await c.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
    const r = await fn(c);
    await c.query('COMMIT');
    return r;
  } catch (e) { await c.query('ROLLBACK').catch(() => {}); throw e; }
  finally { c.release(); }
}

function readCookie(req) {
  for (const part of (req.headers.cookie || '').split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === COOKIE) return v.join('=');
  }
  return null;
}

export async function buildApp({ pools, mailer, config = {} }) {
  const cfg = { sessionHours: 24 * 7, tokenHours: 24, secureCookie: false, allowedOrigin: null,
                loginPerMinute: 10, baseUrl: 'http://localhost:4000', ...config };
  const app = Fastify({ logger: false, trustProxy: !!cfg.trustProxy, bodyLimit: 16 * 1024 });
  await app.register(rateLimit, { global: false });
  const dummyHash = await argonHash('not-a-real-password');
  const limit = { config: { rateLimit: { max: cfg.loginPerMinute, timeWindow: '1 minute' } } };

  // Block cross-site writes. SameSite=Strict cookies are the main defence; this is a second one.
  app.addHook('onRequest', async (req, reply) => {
    const path = req.url.split('?')[0];
    if (path === '/collect' || path === '/v1/metrics') return;
    if (req.method !== 'GET' && cfg.allowedOrigin && req.headers.origin && req.headers.origin !== cfg.allowedOrigin)
      return reply.code(403).send({ error: 'Cross-origin request blocked.' });
  });

  async function session(req) {
    const raw = readCookie(req);
    if (!raw) return null;
    const { rows } = await pools.auth.query('SELECT * FROM starlog.resolve_session($1)', [sha256(raw)]);
    return rows[0] || null;
  }
  const need = (role) => async (req, reply) => {
    const s = await session(req);
    if (!s) return reply.code(401).send({ error: 'Sign in required.' });
    if (role && s.role !== role) return reply.code(403).send({ error: 'Not allowed for this account.' });
    req.user = s;
  };
  const days = (q) => Math.min(Math.max(parseInt(q.days, 10) || 30, 1), 365);
  const cookie = (v, maxAge) => `${COOKIE}=${v}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}${cfg.secureCookie ? '; Secure' : ''}`;

  // ------------------------------------------------------------------ auth
  app.post('/auth/register', limit, async (req, reply) => {
    const { project, email, password } = req.body || {};
    if (typeof project !== 'string' || project.trim().length < 2 || project.length > 60)
      return reply.code(400).send({ error: 'Project name must be 2 to 60 characters.' });
    if (typeof email !== 'string' || !EMAIL.test(email))
      return reply.code(400).send({ error: 'Enter a valid email address.' });
    if (typeof password !== 'string' || password.length < 10 || password.length > 200)
      return reply.code(400).send({ error: 'Password must be 10 to 200 characters.' });
    const base = project.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30) || 'project';
    const pw = await argonHash(password);
    for (let i = 0; i < 3; i++) {
      try {
        const slug = `${base}-${randomBytes(2).toString('hex')}`;
        const { rows } = await pools.auth.query('SELECT * FROM starlog.register_tenant($1,$2,$3,$4)', [slug, project.trim(), email.toLowerCase(), pw]);
        const token = newToken();
        await pools.auth.query('SELECT starlog.create_email_token($1,$2,$3)', [rows[0].user_id, sha256(token), cfg.tokenHours]);
        const verifyUrl = `${cfg.baseUrl}/auth/verify?token=${token}`;
        let sent = true;
        try { await mailer.send({ to: email, subject: 'Verify your Stellog email', link: verifyUrl }); }
        catch (e) { sent = false; req.log?.error?.(e); console.error('[mail] send failed:', e.message); }
        const payload = { message: sent ? 'Account created. Check your email to verify it.'
          : 'Account created, but the verification email could not be sent. Use “Resend verification email” in a few minutes.' };
        if (cfg.exposeVerifyLink) payload.verifyUrl = verifyUrl;
        return reply.code(201).send(payload);
      } catch (e) {
        if (e.constraint === 'users_email_uq') return reply.code(409).send({ error: 'That email is already registered. Sign in instead.' });
        if (e.constraint !== 'tenants_slug_key') throw e;
      }
    }
    return reply.code(500).send({ error: 'Could not create the account. Try again.' });
  });

  app.get('/auth/verify', async (req, reply) => {
    const token = String(req.query.token || '');
    const { rows } = await pools.auth.query('SELECT starlog.verify_email($1) AS ok', [sha256(token)]);
    if (!rows[0].ok) return reply.code(400).send({ error: 'This link is invalid or expired.' });
    if ((req.headers.accept || '').includes('text/html')) return reply.redirect('/login?verified=1');
    return { message: 'Email verified. You can sign in now.' };
  });

  // Neutral answer whether or not the email exists, so this cannot be used to find registered emails.
  app.post('/auth/resend', limit, async (req, reply) => {
    const { email } = req.body || {};
    const neutral = { message: 'If that account exists and is not verified yet, a new email is on its way.' };
    if (typeof email !== 'string' || !EMAIL.test(email)) return neutral;
    const { rows } = await pools.auth.query('SELECT * FROM starlog.login_lookup($1)', [email.toLowerCase()]);
    const u = rows[0];
    if (!u || u.email_verified) return neutral;
    const token = newToken();
    await pools.auth.query('SELECT starlog.create_email_token($1,$2,$3)', [u.user_id, sha256(token), cfg.tokenHours]);
    const verifyUrl = `${cfg.baseUrl}/auth/verify?token=${token}`;
    try { await mailer.send({ to: email.toLowerCase(), subject: 'Verify your Stellog email', link: verifyUrl }); }
    catch (e) { console.error('[mail] resend failed:', e.message); }
    return cfg.exposeVerifyLink ? { ...neutral, verifyUrl } : neutral;
  });

  const neutralReset = { message: 'If that account exists, a reset link is on its way.' };
  app.post('/auth/forgot', limit, async (req, reply) => {
    const { email } = req.body || {};
    if (typeof email !== 'string' || !EMAIL.test(email)) return neutralReset;
    const { rows } = await pools.auth.query('SELECT * FROM starlog.login_lookup($1)', [email.toLowerCase()]);
    const u = rows[0];
    if (!u) return neutralReset;
    const token = newToken();
    await pools.auth.query('SELECT starlog.create_reset_token($1,$2,$3)', [u.user_id, sha256(token), 1]);
    const resetUrl = `${cfg.baseUrl}${u.role === 'operator' ? '/operator/login' : '/login'}?reset=${token}`;
    try { await mailer.send({ to: email.toLowerCase(), subject: 'Reset your Stellog password', link: resetUrl }); }
    catch (e) { console.error('[mail] reset failed:', e.message); }
    return cfg.exposeVerifyLink ? { ...neutralReset, resetUrl } : neutralReset;
  });

  app.post('/auth/reset', limit, async (req, reply) => {
    const { token, password } = req.body || {};
    if (typeof token !== 'string' || typeof password !== 'string' || password.length < 10 || password.length > 200)
      return reply.code(400).send({ error: 'Choose a password of 10 to 200 characters.' });
    const pw = await argonHash(password);
    const { rows } = await pools.auth.query('SELECT starlog.reset_password($1,$2) AS ok', [sha256(token), pw]);
    if (!rows[0].ok) return reply.code(400).send({ error: 'This link is invalid or expired.' });
    return { message: 'Password updated. You can sign in now.' };
  });

  app.post('/auth/wallet/challenge', limit, async (req, reply) => {
    const { publicKey } = req.body || {};
    if (!validPublicKey(publicKey)) return reply.code(400).send({ error: 'That is not a Stellar public key.' });
    const nonce = newToken();
    const message = `Stellog sign-in\n${publicKey}\n${nonce}`;
    await pools.auth.query('SELECT starlog.issue_wallet_challenge($1,$2,$3)', [publicKey, message, sha256(message)]);
    return { message };
  });

  app.post('/auth/wallet', limit, async (req, reply) => {
    const { publicKey, signature, message, project } = req.body || {};
    if (!validPublicKey(publicKey) || typeof signature !== 'string' || typeof message !== 'string' || message.length > 500)
      return reply.code(400).send({ error: 'Send the public key, the challenge, and the signature.' });
    const { rows: challenge } = await pools.auth.query('SELECT starlog.read_wallet_challenge($1,$2) AS message', [publicKey, sha256(message)]);
    if (challenge[0].message !== message || !verifySignedMessage(publicKey, message, signature))
      return reply.code(401).send({ error: 'That signature does not match the sign-in challenge.' });
    const { rows } = await pools.auth.query('SELECT * FROM starlog.login_lookup_wallet($1)', [publicKey]);
    let user = rows[0];
    if (!user) {
      if (typeof project !== 'string' || project.trim().length < 2 || project.length > 60)
        return reply.code(409).send({ needsProject: true, error: 'Name this project to finish creating it.' });
      const base = project.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30) || 'project';
      const pw = await argonHash(randomBytes(32).toString('base64url'));
      let created = null;
      for (let i = 0; i < 3 && !created; i++) {
        try {
          const slug = `${base}-${randomBytes(2).toString('hex')}`;
          created = (await pools.auth.query('SELECT * FROM starlog.register_wallet($1,$2,$3,$4)', [slug, project.trim(), publicKey, pw])).rows[0];
        } catch (e) {
          if (e.constraint === 'users_wallet_uq') {
            user = (await pools.auth.query('SELECT * FROM starlog.login_lookup_wallet($1)', [publicKey])).rows[0];
            break;
          }
          if (e.constraint !== 'tenants_slug_key') throw e;
        }
      }
      if (!user && created) user = { user_id: created.user_id, role: 'tenant' };
      if (!user) return reply.code(500).send({ error: 'Could not create the project. Try again.' });
    }
    if (user.role === 'operator') return reply.code(403).send({ error: 'Operator accounts sign in with email at the operator entrance.' });
    await pools.auth.query('SELECT starlog.consume_wallet_challenge($1)', [sha256(message)]);
    const token = newToken();
    await pools.auth.query('SELECT starlog.create_session($1,$2,$3)', [user.user_id, sha256(token), cfg.sessionHours]);
    reply.header('Set-Cookie', cookie(token, cfg.sessionHours * 3600));
    return { role: 'tenant' };
  });

  app.post('/auth/login', limit, async (req, reply) => {
    const { email, password } = req.body || {};
    if (typeof email !== 'string' || typeof password !== 'string') return reply.code(400).send({ error: 'Enter your email and password.' });
    const { rows } = await pools.auth.query('SELECT * FROM starlog.login_lookup($1)', [email]);
    const u = rows[0];
    // Always run one hash check so response time does not reveal whether the email exists.
    const ok = await argonVerify(u ? u.password_hash : dummyHash, password).catch(() => false);
    if (!u || !ok) return reply.code(401).send({ error: 'Email or password is wrong.' });
    if (!u.email_verified) return reply.code(403).send({ error: 'Verify your email first. Check your inbox.' });
    const token = newToken();
    await pools.auth.query('SELECT starlog.create_session($1,$2,$3)', [u.user_id, sha256(token), cfg.sessionHours]);
    reply.header('Set-Cookie', cookie(token, cfg.sessionHours * 3600));
    return { role: u.role };
  });

  app.post('/auth/logout', async (req, reply) => {
    const raw = readCookie(req);
    if (raw) await pools.auth.query('SELECT starlog.delete_session($1)', [sha256(raw)]);
    reply.header('Set-Cookie', cookie('', 0));
    return { message: 'Signed out.' };
  });

  app.get('/me', { preHandler: need() }, async (req) => ({
    email: req.user.email, role: req.user.role, tenantId: req.user.tenant_id, wallet: req.user.wallet_public_key || null,
  }));

  // ------------------------------------------------------------------ tenant routes (role: starlog_tenant)
  // Note: no query below filters by tenant_id. Postgres row-level security does the isolation.
  app.get('/tenant/sites', { preHandler: need('tenant') }, async (req) =>
    tx(pools.tenant, req.user.tenant_id, async (c) => (await c.query('SELECT id, kind, domain FROM starlog.sites ORDER BY created_at')).rows));

  app.post('/tenant/sites', { preHandler: need('tenant') }, async (req, reply) => {
    const { kind, domain } = req.body || {};
    if (!['web', 'api'].includes(kind) || typeof domain !== 'string' || !DOMAIN.test(domain.toLowerCase()))
      return reply.code(400).send({ error: 'Choose web or api and enter a valid domain, like app.example.com.' });
    try {
      const row = await tx(pools.tenant, req.user.tenant_id, async (c) =>
        (await c.query('INSERT INTO starlog.sites (tenant_id, kind, domain) VALUES (starlog.current_tenant(), $1, $2) RETURNING id, kind, domain', [kind, domain.toLowerCase()])).rows[0]);
      return reply.code(201).send(row);
    } catch (e) {
      if (e.code === '23505') return reply.code(409).send({ error: 'That site is already added.' });
      throw e;
    }
  });

  app.patch('/tenant/share', { preHandler: need('tenant') }, async (req, reply) => {
    if (typeof (req.body || {}).enabled !== 'boolean') return reply.code(400).send({ error: 'Send {"enabled": true} or false.' });
    const r = await tx(pools.tenant, req.user.tenant_id, async (c) =>
      (await c.query('UPDATE starlog.tenants SET share_enabled = $1 WHERE id = starlog.current_tenant() RETURNING slug, share_enabled', [req.body.enabled])).rows[0]);
    return { shareEnabled: r.share_enabled, sharePath: r.share_enabled ? `/share/${r.slug}` : null };
  });

  app.get('/tenant/web/summary', { preHandler: need('tenant') }, async (req) => {
    const span = days(req.query);
    const [rows, dims] = await tx(pools.tenant, req.user.tenant_id, async (c) => {
      const series = (await c.query('SELECT day, page_views::int AS page_views, visitors::int AS visitors FROM starlog.web_daily WHERE day >= current_date - $1::int ORDER BY day', [span])).rows;
      const dimRows = (await c.query('SELECT dim, key, sum(views)::int AS views FROM starlog.web_dim_daily WHERE day >= current_date - $1::int GROUP BY dim, key ORDER BY views DESC', [span])).rows;
      return [series, dimRows];
    });
    const breakdown = { referrer: [], country: [], device: [], browser: [] };
    for (const row of dims) (breakdown[row.dim] || (breakdown[row.dim] = [])).push({ key: row.key, views: row.views });
    return { series: rows, totals: { pageViews: rows.reduce((a, r) => a + r.page_views, 0), visitors: rows.reduce((a, r) => a + r.visitors, 0) }, breakdown };
  });

  // ------------------------------------------------------------------ operator routes (role: starlog_operator)
  app.get('/operator/tenants', { preHandler: need('operator') }, async (req) => {
    const { rows } = await pools.operator.query(
      `SELECT t.id, t.slug, t.name, t.status,
              coalesce(sum(w.page_views),0)::bigint AS page_views,
              coalesce(sum(w.visitors),0)::bigint AS visitors,
              coalesce((SELECT sum(r.requests) FROM starlog.api_hourly r
                         WHERE r.tenant_id = t.id AND r.hour >= current_date - $1::int), 0)::bigint AS api_requests
         FROM starlog.tenants t LEFT JOIN starlog.web_daily w ON w.tenant_id = t.id AND w.day >= current_date - $1::int
        GROUP BY t.id ORDER BY page_views DESC`, [days(req.query)]);
    return rows.map((r) => ({ ...r, page_views: Number(r.page_views), visitors: Number(r.visitors), api_requests: Number(r.api_requests) }));
  });

  app.post('/operator/tenants/:id/remove', { preHandler: need('operator') }, async (req, reply) => {
    if (!UUID.test(req.params.id)) return reply.code(400).send({ error: 'Invalid tenant id.' });
    const r = await pools.operator.query("UPDATE starlog.tenants SET status = 'removed' WHERE id = $1 RETURNING id", [req.params.id]);
    return r.rowCount ? { removed: true } : reply.code(404).send({ error: 'Tenant not found.' });
  });

  app.post('/operator/operators', { preHandler: need('operator') }, async (req, reply) => {
    const { email, password } = req.body || {};
    if (typeof email !== 'string' || !EMAIL.test(email)) return reply.code(400).send({ error: 'Enter a valid email address.' });
    if (typeof password !== 'string' || password.length < 12 || password.length > 200)
      return reply.code(400).send({ error: 'Operator passwords must be 12 to 200 characters.' });
    try {
      const pw = await argonHash(password);
      await pools.operator.query('SELECT starlog.create_operator($1,$2)', [email.toLowerCase(), pw]);
      return reply.code(201).send({ message: 'Operator created. They can sign in at the operator entrance.' });
    } catch (e) {
      if (e.constraint === 'users_email_uq') return reply.code(409).send({ error: 'That email is already registered.' });
      throw e;
    }
  });

  // ------------------------------------------------------------------ public share link (aggregates only)
  app.get('/share/:slug', async (req, reply) => {
    const { rows } = await pools.auth.query('SELECT * FROM starlog.shared_web_totals($1, $2)', [String(req.params.slug).slice(0, 60), days(req.query)]);
    return rows[0] ? rows[0] : reply.code(404).send({ error: 'This link is not shared.' });
  });

  registerProduct(app, { pools, tx, need });

  app.setErrorHandler((err, req, reply) => {
    if (err.statusCode && err.statusCode < 500) return reply.code(err.statusCode).send({ error: err.message });
    req.log?.error?.(err);
    reply.code(500).send({ error: 'Something went wrong on our side.' });
  });
  return app;
}
