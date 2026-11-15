import { createHash, randomBytes } from 'node:crypto';
import { Keypair, Networks, StrKey, Transaction, WebAuth } from '@stellar/stellar-sdk';
import { uuid } from '@/lib/crypto';
import prisma from '@/lib/prisma';

const CHALLENGE_SECONDS = 300;

export function newResetToken() {
  return randomBytes(32).toString('hex');
}

export function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

export function walletKeyFromEnv() {
  if (process.env.STELLAR_AUTH_SECRET) return Keypair.fromSecret(process.env.STELLAR_AUTH_SECRET);
  if (process.env.NODE_ENV === 'production') return null;
  const holder = globalThis as { __starlogWalletKey?: Keypair };
  if (!holder.__starlogWalletKey) {
    holder.__starlogWalletKey = Keypair.random();
    console.warn(
      'STELLAR_AUTH_SECRET is not set: using a temporary key for wallet sign-in (development only).',
    );
  }
  return holder.__starlogWalletKey;
}

export function authHost(request: Request) {
  const fromEnv = process.env.APP_URL || process.env.PUBLIC_URL;
  if (fromEnv) return new URL(fromEnv).hostname;
  return new URL(request.url).hostname;
}

export function buildChallenge(address: string, host: string) {
  const key = walletKeyFromEnv();
  if (!key) return null;
  return WebAuth.buildChallengeTx(key, address, host, CHALLENGE_SECONDS, Networks.PUBLIC, host);
}

// A challenge is accepted only when this server issued it, the address signed it, it has not
// expired, and it has not been used. The Stellar SDK allows five extra minutes; we do not.
export async function consumeChallenge(signedXdr: string, host: string) {
  const key = walletKeyFromEnv();
  if (!key || typeof signedXdr !== 'string' || signedXdr.length > 8192) return null;
  try {
    const read = WebAuth.readChallengeTx(signedXdr, key.publicKey(), Networks.PUBLIC, host, host);
    const signed = WebAuth.verifyChallengeTxSigners(
      signedXdr,
      key.publicKey(),
      Networks.PUBLIC,
      [read.clientAccountID],
      host,
      host,
    );
    if (!signed.includes(read.clientAccountID)) return null;
    const tx = new Transaction(signedXdr, Networks.PUBLIC);
    if (Number(tx.timeBounds.maxTime) < Math.floor(Date.now() / 1000)) return null;
    const expiresAt = new Date(Number(tx.timeBounds.maxTime) * 1000);
    await prisma.client.walletChallenge.deleteMany({ where: { expiresAt: { lt: new Date() } } });
    await prisma.client.walletChallenge.create({
      data: { txHash: Buffer.from(tx.hash()), expiresAt },
    });
    return read.clientAccountID;
  } catch {
    return null;
  }
}

export async function issueReset(userId: string) {
  const token = newResetToken();
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
  await prisma.client.passwordReset.deleteMany({
    where: { userId, usedAt: null },
  });
  await prisma.client.passwordReset.create({
    data: { id: uuid(), userId, tokenHash: hashToken(token), expiresAt },
  });
  return token;
}

export async function takeReset(token: string) {
  const row = await prisma.client.passwordReset.findFirst({
    where: { tokenHash: hashToken(token), usedAt: null, expiresAt: { gt: new Date() } },
  });
  if (!row) return null;
  await prisma.client.passwordReset.update({
    where: { id: row.id },
    data: { usedAt: new Date() },
  });
  return row.userId;
}

export function validAddress(address: string) {
  return StrKey.isValidEd25519PublicKey(address);
}

export const PUBLIC_NETWORK = Networks.PUBLIC;
