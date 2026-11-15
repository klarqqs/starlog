import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { hash } from '@node-rs/argon2';
import { Keypair } from '@stellar/stellar-sdk';
import { buildApp } from '../src/app.js';

const mk = (k) => new pg.Pool({ connectionString: process.env[k], max: 3 });
const pools = { auth: mk('AUTH_DATABASE_URL'), tenant: mk('TENANT_DATABASE_URL'), operator: mk('OPERATOR_DATABASE_URL'), ingest: mk('INGEST_DATABASE_URL') };
const admin = mk('ADMIN_DATABASE_URL');
const mails = [];
const mailer = { async send(m) { mails.push(m); } };
const app = await buildApp({ pools, mailer, config: { loginPerMinute: 1000, exposeVerifyLink: true, baseUrl: 'http://localhost:4000' } });
test.after(async () => { await app.close(); await Promise.all([...Object.values(pools), admin].map((p) => p.end())); });
const post = (url, payload, headers = {}) => app.inject({ method: 'POST', url, payload, headers });
const cookieOf = (res) => (res.headers['set-cookie'] || '').split(';')[0];
const id = randomBytes(3).toString('hex');
const PW = 'correct-horse-battery';

test('forgot password is neutral, and the link replaces the password', async () => {
  const email = `reset-${id}@starlog.test`;
  assert.equal((await post('/auth/register', { project: 'Reset Co', email, password: PW })).statusCode, 201);
  const verify = new URL(mails.at(-1).link).searchParams.get('token');
  assert.equal((await app.inject({ method: 'GET', url: `/auth/verify?token=${verify}` })).statusCode, 200);
  const unknown = await post('/auth/forgot', { email: `nobody-${id}@starlog.test` });
  const known = await post('/auth/forgot', { email });
  assert.equal(unknown.statusCode, 200);
  assert.equal(known.json().message, unknown.json().message);
  assert.equal(mails.length, 2);
  const token = new URL(known.json().resetUrl).searchParams.get('reset');
  assert.equal((await app.inject({ method: 'GET', url: `/auth/verify?token=${token}` })).statusCode, 400);
  assert.equal((await post('/auth/reset', { token, password: 'a-new-password' })).statusCode, 200);
  assert.equal((await post('/auth/login', { email, password: PW })).statusCode, 401);
  assert.equal((await post('/auth/login', { email, password: 'a-new-password' })).statusCode, 200);
  assert.equal((await post('/auth/reset', { token, password: 'a-new-password' })).statusCode, 400);
});

test('only an operator can create another operator', async () => {
  const project = await post('/auth/login', { email: `reset-${id}@starlog.test`, password: 'a-new-password' });
  assert.equal((await post('/operator/operators', { email: `newop-${id}@starlog.test`, password: 'operator-pass-12' }, { cookie: cookieOf(project) })).statusCode, 403);
  const opEmail = `op-${id}@starlog.test`;
  await admin.query("INSERT INTO starlog.users (tenant_id,email,password_hash,role,email_verified_at) VALUES (NULL,$1,$2,'operator',now())", [opEmail, await hash(PW)]);
  const op = await post('/auth/login', { email: opEmail, password: PW });
  const created = await post('/operator/operators', { email: `newop-${id}@starlog.test`, password: 'operator-pass-12' }, { cookie: cookieOf(op) });
  assert.equal(created.statusCode, 201);
  assert.equal((await post('/auth/login', { email: `newop-${id}@starlog.test`, password: 'operator-pass-12' })).json().role, 'operator');
  assert.equal((await post('/operator/operators', { email: `newop-${id}@starlog.test`, password: 'operator-pass-12' }, { cookie: cookieOf(op) })).statusCode, 409);
});

test('a wallet signature opens or creates that project, and a bad signature does not', async () => {
  const keys = Keypair.random();
  const challenge = await post('/auth/wallet/challenge', { publicKey: keys.publicKey() });
  assert.equal(challenge.statusCode, 200);
  const message = challenge.json().message;
  const signature = Buffer.from(keys.signMessage(message)).toString('base64');
  const first = await post('/auth/wallet', { publicKey: keys.publicKey(), signature, message });
  assert.equal(first.statusCode, 409);
  assert.equal(first.json().needsProject, true);
  const created = await post('/auth/wallet', { publicKey: keys.publicKey(), signature, message, project: `Wallet ${id}` });
  assert.equal(created.statusCode, 200);
  assert.equal(created.json().role, 'tenant');
  const again = await post('/auth/wallet/challenge', { publicKey: keys.publicKey() });
  const message2 = again.json().message;
  const signature2 = Buffer.from(keys.signMessage(message2)).toString('base64');
  assert.equal((await post('/auth/wallet', { publicKey: keys.publicKey(), signature: signature2, message: message2 })).statusCode, 200);
  assert.equal((await post('/auth/wallet', { publicKey: keys.publicKey(), signature: Buffer.from(keys.signMessage('nope')).toString('base64'), message: message2 })).statusCode, 401);
});
