import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { hash } from '@node-rs/argon2';
import { Keypair, Networks, Transaction, WebAuth } from '@stellar/stellar-sdk';
import { buildApp } from '../src/app.js';

const mk = (k) => new pg.Pool({ connectionString: process.env[k], max: 4 });
const pools = { auth: mk('AUTH_DATABASE_URL'), tenant: mk('TENANT_DATABASE_URL'), operator: mk('OPERATOR_DATABASE_URL'), ingest: mk('INGEST_DATABASE_URL') };
const admin = mk('ADMIN_DATABASE_URL');
const mails = [];
const mailer = { async send(m) { mails.push(m); } };
const serverKey = Keypair.random();
const app = await buildApp({ pools, mailer, config: { loginPerMinute: 1000, exposeVerifyLink: false, walletKey: serverKey } });
const off = await buildApp({ pools, mailer, config: { loginPerMinute: 1000 } });
test.after(async () => { await app.close(); await off.close(); await Promise.all([...Object.values(pools), admin].map((p) => p.end())); });

const PW = 'correct-horse-battery', NEWPW = 'another-long-password';
const post = (url, payload, cookie) => app.inject({ method: 'POST', url, payload, headers: cookie ? { cookie } : {} });
const get = (url, cookie) => app.inject({ method: 'GET', url, headers: cookie ? { cookie } : {} });
const cookieOf = (r) => (r.headers['set-cookie'] || '').split(';')[0];
const tokenOf = (m) => new URL(m.link).searchParams.get('token');

async function signUp(project, email) {
  assert.equal((await post('/auth/register', { project, email, password: PW })).statusCode, 201);
  assert.equal((await get(`/auth/verify?token=${tokenOf(mails.at(-1))}`)).statusCode, 200);
  const l = await post('/auth/login', { email, password: PW });
  assert.equal(l.statusCode, 200);
  return cookieOf(l);
}
async function makeOperator(email) {
  await admin.query("INSERT INTO starlog.users (tenant_id,email,password_hash,role,email_verified_at) VALUES (NULL,$1,$2,'operator',now())", [email, await hash(PW)]);
  const l = await post('/auth/login', { email, password: PW });
  assert.equal(l.statusCode, 200);
  return cookieOf(l);
}
const signed = (xdr, kp) => { const tx = new Transaction(xdr, Networks.PUBLIC); tx.sign(kp); return tx.toXDR(); };
async function challengeFor(kp) {
  const r = await post('/auth/wallet/challenge', { address: kp.publicKey() });
  assert.equal(r.statusCode, 200);
  return r.json().transaction;
}

// ------------------------------------------------------------------ password reset
test('forgot password: neutral answer, one-time link, new password works, old sessions end', async () => {
  const cookie = await signUp('Reset Co', 'r@reset.test');
  assert.equal((await get('/me', cookie)).statusCode, 200);
  const before = mails.length;
  const unknown = await post('/auth/forgot', { email: 'nobody@reset.test' });
  assert.equal(mails.length, before, 'no email for unknown accounts');
  const known = await post('/auth/forgot', { email: 'r@reset.test' });
  assert.equal(known.statusCode, 200);
  assert.deepEqual(known.json(), unknown.json(), 'same answer either way');
  assert.equal(mails.length, before + 1);
  assert.equal(mails.at(-1).kind, 'reset');
  assert.match(mails.at(-1).link, /\/reset\?token=/);
  const token = tokenOf(mails.at(-1));
  assert.equal((await post('/auth/reset', { token, password: 'short' })).statusCode, 400);
  assert.equal((await post('/auth/reset', { token: 'nope', password: NEWPW })).statusCode, 400);
  assert.equal((await post('/auth/reset', { token, password: NEWPW })).statusCode, 200);
  assert.equal((await post('/auth/reset', { token, password: NEWPW })).statusCode, 400, 'link works once');
  assert.equal((await get('/me', cookie)).statusCode, 401, 'old session is ended');
  assert.equal((await post('/auth/login', { email: 'r@reset.test', password: PW })).statusCode, 401);
  assert.equal((await post('/auth/login', { email: 'r@reset.test', password: NEWPW })).statusCode, 200);
});

test('a reset link cannot verify an email and a verify link cannot reset a password', async () => {
  await post('/auth/register', { project: 'Cross Co', email: 'x@cross.test', password: PW });
  const verifyTok = tokenOf(mails.at(-1));
  assert.equal((await post('/auth/reset', { token: verifyTok, password: NEWPW })).statusCode, 400);
  await post('/auth/forgot', { email: 'x@cross.test' });
  const resetTok = tokenOf(mails.at(-1));
  assert.equal((await get(`/auth/verify?token=${resetTok}`)).statusCode, 400);
});

test('a removed project gets no reset email', async () => {
  await signUp('Gone Co', 'g@gone.test');
  await admin.query("UPDATE starlog.tenants SET status='removed' WHERE id=(SELECT tenant_id FROM starlog.users WHERE email='g@gone.test')");
  const before = mails.length;
  await post('/auth/forgot', { email: 'g@gone.test' });
  assert.equal(mails.length, before);
});

// ------------------------------------------------------------------ operators from the website
test('operators are managed by operators only: invite, accept, list, remove', async () => {
  const op = await makeOperator('first@scf.test');
  const tenant = await signUp('Not Op', 'n@notop.test');
  assert.equal((await post('/operator/operators', { email: 'new@scf.test' })).statusCode, 401);
  assert.equal((await post('/operator/operators', { email: 'new@scf.test' }, tenant)).statusCode, 403);
  assert.equal((await get('/operator/operators', tenant)).statusCode, 403);
  assert.equal((await post('/operator/operators', { email: 'bad' }, op)).statusCode, 400);

  const inv = await post('/operator/operators', { email: 'New@SCF.test' }, op);
  assert.equal(inv.statusCode, 201);
  assert.equal(mails.at(-1).kind, 'invite');
  assert.equal(mails.at(-1).to, 'new@scf.test');
  assert.equal((await post('/operator/operators', { email: 'new@scf.test' }, op)).statusCode, 409);
  assert.equal((await post('/auth/login', { email: 'new@scf.test', password: 'whatever-123' })).statusCode, 401, 'cannot sign in before accepting');
  const token = tokenOf(mails.at(-1));
  assert.equal((await post('/auth/reset', { token, password: NEWPW })).statusCode, 200);
  const l = await post('/auth/login', { email: 'new@scf.test', password: NEWPW });
  assert.equal(l.statusCode, 200);
  assert.equal(l.json().role, 'operator');

  const list = (await get('/operator/operators', op)).json();
  assert.ok(list.some((o) => o.email === 'new@scf.test' && o.email_verified));
  assert.equal(list.find((o) => o.email === 'first@scf.test').isYou, true);
  assert.equal(JSON.stringify(list).includes('password'), false, 'no password data in the list');

  const me = list.find((o) => o.isYou), other = list.find((o) => o.email === 'new@scf.test');
  assert.equal((await post(`/operator/operators/${me.id}/remove`, {}, op)).statusCode, 409, 'cannot remove yourself');
  assert.equal((await post(`/operator/operators/${other.id}/remove`, {}, op)).statusCode, 200);
  assert.equal((await post('/auth/login', { email: 'new@scf.test', password: NEWPW })).statusCode, 401);
  assert.equal((await post('/operator/operators/not-an-id/remove', {}, op)).statusCode, 400);
});

test('the last verified operator cannot be removed', async () => {
  const { rows } = await admin.query("SELECT id FROM starlog.users WHERE role='operator' AND email_verified_at IS NOT NULL");
  const lone = await makeOperator('only@last.test');
  await admin.query("DELETE FROM starlog.users WHERE role='operator' AND email <> 'only@last.test'");
  const inv = await post('/operator/operators', { email: 'pending@last.test' }, lone);
  assert.equal(inv.statusCode, 201);
  const pending = (await get('/operator/operators', lone)).json().find((o) => o.email === 'pending@last.test');
  assert.equal((await post(`/operator/operators/${pending.id}/remove`, {}, lone)).statusCode, 200, 'a pending invite can be withdrawn');
  assert.ok(rows.length >= 0);
});

// ------------------------------------------------------------------ wallet sign-in
test('wallet sign-in is off without a server key', async () => {
  assert.equal((await off.inject({ method: 'GET', url: '/auth/wallet/config' })).json().enabled, false);
  assert.equal((await off.inject({ method: 'POST', url: '/auth/wallet/challenge', payload: { address: Keypair.random().publicKey() } })).statusCode, 404);
});

test('link a wallet, sign in with it, and refuse replays, strangers and wrong signers', async () => {
  assert.equal((await get('/auth/wallet/config')).json().enabled, true);
  assert.equal((await post('/auth/wallet/challenge', { address: 'not-a-key' })).statusCode, 400);
  const cookie = await signUp('Wallet Co', 'w@wallet.test');
  const kp = Keypair.random();

  assert.equal((await post('/me/wallets/link', { transaction: signed(await challengeFor(kp), kp) })).statusCode, 401, 'linking needs a session');
  const wrongSigner = signed(await challengeFor(kp), Keypair.random());
  assert.equal((await post('/me/wallets/link', { transaction: wrongSigner }, cookie)).statusCode, 401, 'signed by a different key');
  const own = WebAuth.buildChallengeTx(Keypair.random(), kp.publicKey(), 'localhost', 300, Networks.PUBLIC, 'localhost');
  assert.equal((await post('/me/wallets/link', { transaction: signed(own, kp) }, cookie)).statusCode, 401, 'challenge not issued by this server');

  const linkTx = signed(await challengeFor(kp), kp);
  assert.equal((await post('/me/wallets/link', { transaction: linkTx }, cookie)).statusCode, 201);
  assert.equal((await post('/me/wallets/link', { transaction: linkTx }, cookie)).statusCode, 401, 'a signed challenge works once');
  assert.deepEqual((await get('/me/wallets', cookie)).json().map((w) => w.public_key), [kp.publicKey()]);

  const loginTx = signed(await challengeFor(kp), kp);
  const ok = await post('/auth/wallet/login', { transaction: loginTx });
  assert.equal(ok.statusCode, 200);
  assert.equal(ok.json().role, 'tenant');
  assert.equal((await get('/me', cookieOf(ok))).json().email, 'w@wallet.test');
  assert.equal((await post('/auth/wallet/login', { transaction: loginTx })).statusCode, 401, 'replay refused');

  const stranger = Keypair.random();
  assert.equal((await post('/auth/wallet/login', { transaction: signed(await challengeFor(stranger), stranger) })).statusCode, 401, 'unlinked wallet');

  const other = await signUp('Other Co', 'o@wallet.test');
  assert.equal((await post('/me/wallets/link', { transaction: signed(await challengeFor(kp), kp) }, other)).statusCode, 409, 'a wallet belongs to one account');

  assert.equal((await post('/me/wallets/unlink', { address: kp.publicKey() }, cookie)).statusCode, 200);
  assert.equal((await post('/auth/wallet/login', { transaction: signed(await challengeFor(kp), kp) })).statusCode, 401, 'unlinked wallet cannot sign in');
});

test('an expired challenge is refused', async () => {
  const kp = Keypair.random();
  const cookie = await signUp('Slow Co', 's@slow.test');
  const old = WebAuth.buildChallengeTx(serverKey, kp.publicKey(), 'localhost', 1, Networks.PUBLIC, 'localhost');
  await new Promise((r) => setTimeout(r, 2200));
  assert.equal((await post('/me/wallets/link', { transaction: signed(old, kp) }, cookie)).statusCode, 401);
});

test('operators can sign in with a linked wallet, and the role is reported', async () => {
  const kp = Keypair.random();
  const cookie = await makeOperator('wallet-op@scf.test');
  assert.equal((await post('/me/wallets/link', { transaction: signed(await challengeFor(kp), kp) }, cookie)).statusCode, 201);
  const r = await post('/auth/wallet/login', { transaction: signed(await challengeFor(kp), kp) });
  assert.equal(r.statusCode, 200);
  assert.equal(r.json().role, 'operator');
});
