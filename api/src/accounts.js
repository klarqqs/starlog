import { createHash } from 'node:crypto';
import { hash as argonHash } from '@node-rs/argon2';
import { Keypair, Networks, StrKey, Transaction, WebAuth } from '@stellar/stellar-sdk';

const sha256 = (s) => createHash('sha256').update(s).digest();
const NEUTRAL_RESET = { message: 'If that account exists, a password reset link is on its way.' };
const CHALLENGE_SECONDS = 300;

// Password reset, operator invites, and wallet sign-in (SEP-10 challenge signed by Freighter or xBull).
export function registerAccounts(app, { pools, mailer, cfg, need, limit, helpers }) {
  const { EMAIL, newToken, cookie } = helpers;
  const home = new URL(cfg.baseUrl).hostname;
  const walletKey = cfg.walletKey || null;
  const noWallet = (reply) => reply.code(404).send({ error: 'Wallet sign-in is not enabled on this server.' });

  async function sendLink(to, subject, kind, path, token) {
    await mailer.send({ to, subject, kind, link: `${cfg.baseUrl}${path}?token=${token}` });
  }

  // ---------------------------------------------------------------- forgot / reset password
  app.post('/auth/forgot', limit, async (req) => {
    const { email } = req.body || {};
    if (typeof email !== 'string' || !EMAIL.test(email)) return NEUTRAL_RESET;
    const token = newToken();
    const { rows } = await pools.auth.query('SELECT * FROM starlog.request_reset($1,$2,$3)', [email, sha256(token), 1]);
    if (!rows[0]) return NEUTRAL_RESET;
    try { await sendLink(email.toLowerCase(), 'Reset your Starlog password', 'reset', '/reset', token); }
    catch (e) { console.error('[mail] reset failed:', e.message); }
    return cfg.exposeVerifyLink ? { ...NEUTRAL_RESET, resetUrl: `${cfg.baseUrl}/reset?token=${token}` } : NEUTRAL_RESET;
  });

  app.post('/auth/reset', limit, async (req, reply) => {
    const { token, password } = req.body || {};
    if (typeof password !== 'string' || password.length < 10 || password.length > 200)
      return reply.code(400).send({ error: 'Password must be 10 to 200 characters.' });
    if (typeof token !== 'string' || !token) return reply.code(400).send({ error: 'This link is invalid or expired.' });
    const { rows } = await pools.auth.query('SELECT starlog.reset_password($1,$2) AS ok', [sha256(token), await argonHash(password)]);
    return rows[0].ok ? { message: 'Password updated. Sign in with the new password.' }
                      : reply.code(400).send({ error: 'This link is invalid or expired.' });
  });

  // ---------------------------------------------------------------- operators managed from the website
  app.get('/operator/operators', { preHandler: need('operator') }, async (req) => {
    const { rows } = await pools.auth.query('SELECT * FROM starlog.list_operators()');
    return rows.map((r) => ({ ...r, isYou: r.id === req.user.user_id }));
  });

  app.post('/operator/operators', { preHandler: need('operator') }, async (req, reply) => {
    const { email } = req.body || {};
    if (typeof email !== 'string' || !EMAIL.test(email)) return reply.code(400).send({ error: 'Enter a valid email address.' });
    const token = newToken();
    try { await pools.auth.query('SELECT starlog.create_operator_invite($1,$2,$3)', [email, sha256(token), 72]); }
    catch (e) {
      if (e.constraint === 'users_email_uq') return reply.code(409).send({ error: 'That email already has an account.' });
      throw e;
    }
    let sent = true;
    try { await sendLink(email.toLowerCase(), 'You are invited as a Starlog operator', 'invite', '/reset', token); }
    catch (e) { sent = false; console.error('[mail] invite failed:', e.message); }
    const out = { message: sent ? 'Invite sent. The link is valid for 72 hours.'
      : 'Operator created, but the email could not be sent. Ask them to use “Forgot password” on the operator sign-in page.' };
    if (cfg.exposeVerifyLink) out.inviteUrl = `${cfg.baseUrl}/reset?token=${token}`;
    return reply.code(201).send(out);
  });

  app.post('/operator/operators/:id/remove', { preHandler: need('operator') }, async (req, reply) => {
    if (!/^[0-9a-f-]{36}$/.test(req.params.id)) return reply.code(400).send({ error: 'Invalid operator id.' });
    const { rows } = await pools.auth.query('SELECT starlog.remove_operator($1,$2) AS r', [req.params.id, req.user.user_id]);
    const r = rows[0].r;
    if (r === 'ok') return { removed: true };
    const msg = { self: 'You cannot remove your own account.', last: 'You cannot remove the last signed-up operator.', missing: 'Operator not found.' }[r];
    return reply.code(r === 'missing' ? 404 : 409).send({ error: msg });
  });

  // ---------------------------------------------------------------- wallet sign-in (SEP-10)
  // The server builds a challenge transaction. The wallet signs it. It is never sent to the network.
  app.get('/auth/wallet/config', async () => ({ enabled: !!walletKey, networkPassphrase: Networks.PUBLIC, wallets: ['freighter', 'xbull'] }));

  app.post('/auth/wallet/challenge', limit, async (req, reply) => {
    if (!walletKey) return noWallet(reply);
    const address = String((req.body || {}).address || '');
    if (!StrKey.isValidEd25519PublicKey(address)) return reply.code(400).send({ error: 'That is not a valid Stellar address.' });
    const transaction = WebAuth.buildChallengeTx(walletKey, address, home, CHALLENGE_SECONDS, Networks.PUBLIC, home);
    return { transaction, networkPassphrase: Networks.PUBLIC };
  });

  // Returns the signing address if the challenge is ours, fresh, signed by that address, and unused.
  async function proof(signedXdr) {
    if (typeof signedXdr !== 'string' || signedXdr.length > 8192) return null;
    try {
      const read = WebAuth.readChallengeTx(signedXdr, walletKey.publicKey(), Networks.PUBLIC, home, home);
      const signed = WebAuth.verifyChallengeTxSigners(signedXdr, walletKey.publicKey(), Networks.PUBLIC, [read.clientAccountID], home, home);
      if (!signed.includes(read.clientAccountID)) return null;
      const tx = new Transaction(signedXdr, Networks.PUBLIC);
      // The SDK allows a 5 minute grace period after expiry. We do not: a challenge dies when it says it does.
      if (Number(tx.timeBounds.maxTime) < Math.floor(Date.now() / 1000)) return null;
      const expires = new Date(Number(tx.timeBounds.maxTime) * 1000);
      const { rows } = await pools.auth.query('SELECT starlog.consume_challenge($1,$2) AS ok', [tx.hash(), expires]);
      return rows[0].ok ? read.clientAccountID : null;
    } catch { return null; }
  }

  app.post('/auth/wallet/login', limit, async (req, reply) => {
    if (!walletKey) return noWallet(reply);
    const address = await proof((req.body || {}).transaction);
    if (!address) return reply.code(401).send({ error: 'The wallet signature could not be verified. Try again.' });
    const { rows } = await pools.auth.query('SELECT * FROM starlog.wallet_lookup($1)', [address]);
    const u = rows[0];
    if (!u) return reply.code(401).send({ error: 'No account is linked to this wallet. Sign in with email, then link your wallet in the dashboard.' });
    if (!u.email_verified) return reply.code(403).send({ error: 'Verify your email first. Check your inbox.' });
    const token = newToken();
    await pools.auth.query('SELECT starlog.create_session($1,$2,$3)', [u.user_id, sha256(token), cfg.sessionHours]);
    reply.header('Set-Cookie', cookie(token, cfg.sessionHours * 3600));
    return { role: u.role };
  });

  app.get('/me/wallets', { preHandler: need() }, async (req) =>
    (await pools.auth.query('SELECT * FROM starlog.list_wallets($1)', [req.user.user_id])).rows);

  app.post('/me/wallets/link', { preHandler: need(), ...limit }, async (req, reply) => {
    if (!walletKey) return noWallet(reply);
    const address = await proof((req.body || {}).transaction);
    if (!address) return reply.code(401).send({ error: 'The wallet signature could not be verified. Try again.' });
    const { rows } = await pools.auth.query('SELECT starlog.link_wallet($1,$2) AS ok', [req.user.user_id, address]);
    return rows[0].ok ? reply.code(201).send({ linked: address })
                      : reply.code(409).send({ error: 'That wallet is already linked to an account, or you have reached 5 wallets.' });
  });

  app.post('/me/wallets/unlink', { preHandler: need() }, async (req, reply) => {
    const address = String((req.body || {}).address || '');
    if (!StrKey.isValidEd25519PublicKey(address)) return reply.code(400).send({ error: 'That is not a valid Stellar address.' });
    const { rows } = await pools.auth.query('SELECT starlog.unlink_wallet($1,$2) AS ok', [req.user.user_id, address]);
    return rows[0].ok ? { unlinked: true } : reply.code(404).send({ error: 'That wallet is not linked.' });
  });
}

export const walletKeyFromEnv = (env = process.env) => {
  if (env.STELLAR_AUTH_SECRET) return Keypair.fromSecret(env.STELLAR_AUTH_SECRET);
  if (env.NODE_ENV === 'production') return null;
  console.warn('STELLAR_AUTH_SECRET is not set: using a temporary key for wallet sign-in (development only).');
  return Keypair.random();
};
