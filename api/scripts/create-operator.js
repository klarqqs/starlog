// Usage: ADMIN_DATABASE_URL=... node scripts/create-operator.js email password
import pg from 'pg';
import { hash } from '@node-rs/argon2';
const [email, password] = process.argv.slice(2);
if (!process.env.ADMIN_DATABASE_URL || !email || !password || password.length < 12) {
  console.error('Usage: ADMIN_DATABASE_URL=... node scripts/create-operator.js <email> <password of 12+ chars>'); process.exit(1);
}
const c = new pg.Client({ connectionString: process.env.ADMIN_DATABASE_URL });
await c.connect();
await c.query("INSERT INTO starlog.users (tenant_id,email,password_hash,role,email_verified_at) VALUES (NULL,$1,$2,'operator',now())", [email.toLowerCase(), await hash(password)]);
await c.end(); console.log('Operator created.');
