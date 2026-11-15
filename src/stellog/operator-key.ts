import { hash, uuid } from '@/lib/crypto';
import { getRandomChars } from '@/lib/generate';
import prisma from '@/lib/prisma';

const PREFIX = 'opk_';

export function generateOperatorToken() {
  const token = `${PREFIX}${getRandomChars(32)}`;
  return {
    token,
    keyHash: hash(token),
    keyPrefix: token.slice(0, 12),
  };
}

export async function createOperatorKey(createdBy: string, name: string) {
  const generated = generateOperatorToken();
  const id = uuid();
  await prisma.client.operatorApiKey.create({
    data: {
      id,
      name,
      keyHash: generated.keyHash,
      keyPrefix: generated.keyPrefix,
      createdBy,
    },
  });
  return { id, name, prefix: generated.keyPrefix, token: generated.token };
}

export async function listOperatorKeys() {
  return prisma.client.operatorApiKey.findMany({
    select: {
      id: true,
      name: true,
      keyPrefix: true,
      createdAt: true,
      revokedAt: true,
      lastUsedAt: true,
    },
    orderBy: { createdAt: 'desc' },
  });
}

export async function revokeOperatorKey(keyId: string) {
  const result = await prisma.client.operatorApiKey.updateMany({
    where: { id: keyId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  return result.count;
}

export async function findActiveOperatorKey(token: string) {
  if (!token.startsWith(PREFIX)) return null;
  const row = await prisma.client.operatorApiKey.findUnique({
    where: { keyHash: hash(token) },
    select: { id: true, revokedAt: true },
  });
  if (!row || row.revokedAt) return null;
  await prisma.client.operatorApiKey.update({
    where: { id: row.id },
    data: { lastUsedAt: new Date() },
  });
  return { id: row.id };
}
