import { hash, uuid } from '@/lib/crypto';
import { getRandomChars } from '@/lib/generate';
import prisma from '@/lib/prisma';

const PREFIX = 'stk_';

export function generateIngestToken() {
  const token = `${PREFIX}${getRandomChars(32)}`;
  return {
    token,
    keyHash: hash(token),
    keyPrefix: token.slice(0, 12),
  };
}

export async function findActiveIngestKey(token: string): Promise<{ websiteId: string } | null> {
  if (!token.startsWith(PREFIX)) return null;
  const row = await prisma.client.ingestKey.findUnique({
    where: { keyHash: hash(token) },
    select: { websiteId: true, revokedAt: true },
  });
  if (!row || row.revokedAt) return null;
  return { websiteId: row.websiteId };
}

export async function createIngestKey(websiteId: string, name: string) {
  const generated = generateIngestToken();
  const id = uuid();
  await prisma.client.ingestKey.create({
    data: {
      id,
      websiteId,
      name,
      keyHash: generated.keyHash,
      keyPrefix: generated.keyPrefix,
    },
  });
  return { id, name, prefix: generated.keyPrefix, token: generated.token };
}

export async function listIngestKeys(websiteId: string) {
  return prisma.client.ingestKey.findMany({
    where: { websiteId },
    select: { id: true, name: true, keyPrefix: true, revokedAt: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  });
}

export async function revokeIngestKey(websiteId: string, keyId: string) {
  const result = await prisma.client.ingestKey.updateMany({
    where: { id: keyId, websiteId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  return result.count;
}
