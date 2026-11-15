import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { buildApp } from '../src/app.js';
import { createMailer } from '../src/mailer.js';

// ---- mailer unit tests (no database)
test('without SMTP_HOST the dev mailer logs and production refuses to start', () => {
  assert.equal(createMailer({}).kind, 'console');
  assert.throws(() => createMailer({ NODE_ENV: 'production' }), /SMTP_HOST/);
});

test('SMTP mailer sends text and escaped html with the verify link', async () => {
  const sent = [];
  const m = createMailer({ SMTP_HOST: 'smtp.test', MAIL_FROM: 'Starlog <hi@starlog.test>' }, { sendMail: async (x) => sent.push(x) });
  assert.equal(m.kind, 'smtp');
  await m.send({ to: 'a@b.test', subject: 'Verify', link: 'https://x.test/auth/verify?token=a&b="<' });
  assert.equal(sent[0].from, 'Starlog <hi@starlog.test>');
  assert.equal(sent[0].to, 'a@b.test');
  assert.match(sent[0].text, /token=a&b="</);
  assert.ok(sent[0].html.includes('token=a&amp;b=&quot;&lt;'));
  assert.ok(!sent[0].html.includes('"<'));
});

// ---- API behavior when mail fails
const mk = (k) => new pg.Pool({ connectionString: process.env[k], max: 3 });
const pools = { auth: mk('AUTH_DATABASE_URL'), tenant: mk('TENANT_DATABASE_URL'), operator: mk('OPERATOR_DATABASE_URL'), ingest: mk('INGEST_DATABASE_URL') };
const admin = mk('ADMIN_DATABASE_URL');
let failing = true;
const mails = [];
const mailer = { async send(m) { if (failing) throw new Error('smtp down'); mails.push(m); } };
const app = await buildApp({ pools, mailer, config: { loginPerMinute: 1000, exposeVerifyLink: false } });
test.after(async () => { await app.close(); await Promise.all([...Object.values(pools), admin].map((p) => p.end())); });
const post = (url, payload) => app.inject({ method: 'POST', url, payload });
const EMAIL = 'mailfail@gamma.test', PW = 'correct-horse-battery';

test('register still succeeds when the email cannot be sent, and says so', async () => {
  const r = await post('/auth/register', { project: 'Gamma', email: EMAIL, password: PW });
  assert.equal(r.statusCode, 201);
  assert.match(r.json().message, /could not be sent/);
  assert.equal(r.json().verifyUrl, undefined);
});

test('resend sends a working link once mail is back, and is neutral for unknown or verified emails', async () => {
  failing = false;
  const unknown = await post('/auth/resend', { email: 'nobody@gamma.test' });
  assert.equal(unknown.statusCode, 200);
  assert.equal(mails.length, 0);
  const r = await post('/auth/resend', { email: EMAIL });
  assert.equal(r.statusCode, 200);
  assert.equal(r.json().message, unknown.json().message);
  assert.equal(mails.length, 1);
  const token = new URL(mails[0].link).searchParams.get('token');
  assert.equal((await app.inject({ url: `/auth/verify?token=${token}` })).statusCode, 200);
  assert.equal((await post('/auth/login', { email: EMAIL, password: PW })).statusCode, 200);
  await post('/auth/resend', { email: EMAIL });
  assert.equal(mails.length, 1, 'verified accounts get no further email');
});

test('reset and invite emails use their own wording, not the verify text', async () => {
  const sent = [];
  const m = createMailer({ SMTP_HOST: 'smtp.test' }, { sendMail: async (x) => sent.push(x) });
  await m.send({ to: 'a@b.test', subject: 'Reset', kind: 'reset', link: 'https://x.test/reset?token=1' });
  await m.send({ to: 'a@b.test', subject: 'Invite', kind: 'invite', link: 'https://x.test/reset?token=2' });
  assert.match(sent[0].text, /password reset was requested/i);
  assert.match(sent[0].text, /valid for 1 hour/);
  assert.doesNotMatch(sent[0].text, /Welcome|Verify your email/);
  assert.match(sent[1].text, /invited to operate Starlog/);
  assert.match(sent[1].text, /valid for 72 hours/);
});
