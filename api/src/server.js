import pg from 'pg';
import { buildApp } from './app.js';

const need = (k) => { if (!process.env[k]) { console.error(`Missing env var ${k}`); process.exit(1); } return process.env[k]; };
const pool = (k) => new pg.Pool({ connectionString: need(k), max: 10 });
const pools = {
  auth: pool('AUTH_DATABASE_URL'), tenant: pool('TENANT_DATABASE_URL'),
  operator: pool('OPERATOR_DATABASE_URL'), ingest: pool('INGEST_DATABASE_URL') };

// Development mailer prints the link. Replace with SMTP before production.
const mailer = { async send(m) { console.log(`[mail] to=${m.to} link=${m.link}`); } };

const app = await buildApp({ pools, mailer, config: {
  baseUrl: process.env.PUBLIC_URL || 'http://127.0.0.1:4000',
  exposeVerifyLink: process.env.NODE_ENV !== 'production',
  allowedOrigin: process.env.ALLOWED_ORIGIN || null,
  secureCookie: process.env.NODE_ENV === 'production',
  trustProxy: process.env.TRUST_PROXY === '1' } });
await app.listen({ port: +(process.env.PORT || 4000), host: process.env.HOST || '127.0.0.1' });
console.log('Starlog API listening');
