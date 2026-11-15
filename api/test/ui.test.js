import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { hash } from '@node-rs/argon2';
import { JSDOM, VirtualConsole } from 'jsdom';
import { Keypair, Networks, Transaction } from '@stellar/stellar-sdk';
import { buildApp } from '../src/app.js';

// Drives the real pages (web/index.html) in jsdom against the real server and database.
// A stand-in wallet signs with a real Stellar key, so the browser flow is exercised end to end.
// What this cannot cover: the real Freighter / xBull extensions.
const PORT = 4021, BASE = `http://127.0.0.1:${PORT}`;
const mk = (k) => new pg.Pool({ connectionString: process.env[k], max: 4 });
const pools = { auth: mk('AUTH_DATABASE_URL'), tenant: mk('TENANT_DATABASE_URL'), operator: mk('OPERATOR_DATABASE_URL'), ingest: mk('INGEST_DATABASE_URL') };
const admin = mk('ADMIN_DATABASE_URL');
const app = await buildApp({ pools, mailer: { async send() {} }, config: { loginPerMinute: 1000, exposeVerifyLink: true, baseUrl: BASE, walletKey: Keypair.random() } });
await app.listen({ port: PORT, host: '127.0.0.1' });
test.after(async () => { await app.close(); await Promise.all([...Object.values(pools), admin].map((p) => p.end())); });

const jar = new Map();
const wait = (ms = 250) => new Promise((r) => setTimeout(r, ms));
const call = async (path, opts = {}) => {
  const res = await fetch(new URL(path, BASE), { ...opts, headers: { ...(opts.headers || {}), cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; ') }, redirect: 'manual' });
  for (const c of res.headers.getSetCookie?.() || []) { const [kv] = c.split(';'); const [k, ...v] = kv.split('='); v.join('=') ? jar.set(k, v.join('=')) : jar.delete(k); }
  return res;
};
async function open(path, { wallet } = {}) {
  const errors = [];
  const vc = new VirtualConsole(); vc.on('jsdomError', (e) => { if (!/not implemented/i.test(e.message)) errors.push(e.message); }); vc.on('error', (e) => errors.push(String(e)));
  const html = await (await call(path)).text();
  const dom = new JSDOM(html, { url: `${BASE}${path}`, runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(w) {
      w.fetch = (u, o) => call(new URL(u, w.location.href).pathname + new URL(u, w.location.href).search, o);
      w.confirm = () => true;
      if (wallet) w.StarlogWallet = wallet; // stand-in for the bundled Freighter / xBull script
      w.onerror = (m) => errors.push(String(m));
    } });
  await wait(400);
  return { w: dom.window, d: dom.window.document, errors, $: (s) => dom.window.document.querySelector(s) };
}
const type = (el, v) => { el.value = v; el.dispatchEvent(new el.ownerDocument.defaultView.Event('input', { bubbles: true })); };
const submit = (form) => form.dispatchEvent(new form.ownerDocument.defaultView.Event('submit', { bubbles: true, cancelable: true }));
const click = (el) => el.dispatchEvent(new el.ownerDocument.defaultView.MouseEvent('click', { bubbles: true, cancelable: true }));
const json = async (p, o) => (await call(p, o)).json();
const post = (p, b) => call(p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) });

const kp = Keypair.random();
const fakeWallet = { async signChallenge(id, challengeFor, passphrase) {
  assert.equal(passphrase, Networks.PUBLIC);
  const xdr = await challengeFor(kp.publicKey());
  const tx = new Transaction(xdr, passphrase); tx.sign(kp);
  return { address: kp.publicKey(), signedTxXdr: tx.toXDR() };
} };

test('marketing pages link to the right places', async () => {
  const home = await open('/');
  assert.ok(home.$('a[href="/login?mode=register"]'));
  assert.ok(home.$('a[href="/operator/login"]'));
  assert.ok(home.$('a[href="/docs"]'));
});

test('project sign-in page: forgot link and wallet buttons appear', async () => {
  const p = await open('/login');
  assert.ok(p.$('a[href="/forgot"]'));
  assert.ok(!p.$('#wallet-row').classList.contains('hide'), 'wallet row visible when enabled');
  assert.ok(p.$('[data-wallet="freighter"]') && p.$('[data-wallet="xbull"]'));
  assert.deepEqual(p.errors, []);
});

test('forgot password then reset, through the pages', async () => {
  await post('/auth/register', { project: 'UI Co', email: 'ui@ui.test', password: 'correct-horse-battery' });
  const v = await json('/auth/forgot', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'ui@ui.test' }) });
  const f = await open('/forgot');
  type(f.$('#email'), 'ui@ui.test'); submit(f.$('#forgot')); await wait();
  assert.match(f.$('#note').textContent, /reset link is on its way/);
  const link = f.$('#note a').href;
  const r = await open(new URL(link).pathname + new URL(link).search);
  type(r.$('#pw'), 'brand-new-password'); type(r.$('#pw2'), 'different-password'); submit(r.$('#reset')); await wait();
  assert.match(r.$('#err').textContent, /do not match/);
  type(r.$('#pw2'), 'brand-new-password'); submit(r.$('#reset')); await wait();
  assert.match(r.$('#note').textContent, /Password updated/);
  assert.equal((await post('/auth/login', { email: 'ui@ui.test', password: 'brand-new-password' })).status, 200, 'new password works, and a reset also proves the email');
  assert.ok(v.message);
});

test('link a wallet from the dashboard, then sign in with it from the login page', async () => {
  jar.clear();
  await post('/auth/register', { project: 'Wallet UI', email: 'wui@ui.test', password: 'correct-horse-battery' }).then((r) => r.json());
  const tok = (await json('/auth/resend', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'wui@ui.test' }) })).verifyUrl;
  assert.equal((await call(new URL(tok).pathname + new URL(tok).search)).status, 200);
  assert.equal((await post('/auth/login', { email: 'wui@ui.test', password: 'correct-horse-battery' })).status, 200);

  const dash = await open('/app', { wallet: fakeWallet });
  assert.ok(dash.$('#wallets'), 'wallet card shown');
  click(dash.$('[data-link="freighter"]')); await wait(600);
  assert.deepEqual((await json('/me/wallets')).map((w) => w.public_key), [kp.publicKey()]);
  assert.deepEqual(dash.errors, []);

  await post('/auth/logout', {}); jar.clear();
  const login = await open('/login', { wallet: fakeWallet });
  click(login.$('[data-wallet="xbull"]')); await wait(800);
  assert.equal((await json('/me')).email, 'wui@ui.test', 'signed in by wallet');
  assert.deepEqual(login.errors, []);

  await post('/auth/logout', {}); jar.clear();
  const opDoor = await open('/operator/login', { wallet: fakeWallet });
  click(opDoor.$('[data-wallet="freighter"]')); await wait(800);
  assert.match(opDoor.$('#err').textContent, /SCF operators/, 'a project wallet is turned away at the operator door');
  assert.equal((await call('/me')).status, 401, 'and is signed out again');
});

test('operator page: invite and remove operators', async () => {
  jar.clear();
  await admin.query("INSERT INTO starlog.users (tenant_id,email,password_hash,role,email_verified_at) VALUES (NULL,'ui-op@scf.test',$1,'operator',now())", [await hash('correct-horse-battery')]);
  assert.equal((await post('/auth/login', { email: 'ui-op@scf.test', password: 'correct-horse-battery' })).status, 200);
  const o = await open('/operator');
  assert.ok(o.$('#operators'), 'operators card shown');
  assert.match(o.$('#operators').textContent, /ui-op@scf\.test \(you\)/);
  type(o.$('#op-email'), 'invitee@scf.test'); submit(o.$('#invite')); await wait(600);
  assert.match(o.$('#op-msg').textContent, /Invite sent/);
  const list = await json('/operator/operators');
  assert.ok(list.some((x) => x.email === 'invitee@scf.test' && !x.email_verified));
  type(o.$('#op-email'), 'invitee@scf.test'); submit(o.$('#invite')); await wait(500);
  assert.match(o.$('#op-err').textContent, /already has an account/);
  assert.deepEqual(o.errors, []);
});
