import { hash, uuid } from '@/lib/crypto';
import { getRandomChars } from '@/lib/generate';
import prisma from '@/lib/prisma';
import type { IngestKeyScope } from './ingest';

const PREFIX = 'stk_';

export function generateIngestToken() {
  const token = `${PREFIX}${getRandomChars(32)}`;
  return {
    token,
    keyHash: hash(token),
    keyPrefix: token.slice(0, 12),
  };
}

async function teamForWebsite(websiteId: string) {
  const website = await prisma.client.website.findFirst({
    where: { id: websiteId, deletedAt: null },
    select: { id: true, name: true, teamId: true, userId: true },
  });
  if (!website) return null;
  if (website.teamId) return website.teamId;

  const teamId = uuid();
  await prisma.transaction(async (tx: any) => {
    await tx.team.create({
      data: {
        id: teamId,
        name: website.name.slice(0, 50),
        enrollmentStatus: 'active',
      },
    });
    await tx.website.update({ where: { id: websiteId }, data: { teamId } });
    if (website.userId) {
      await tx.teamUser.create({
        data: { id: uuid(), teamId, userId: website.userId, role: 'team-owner' },
      });
    }
  });
  return teamId;
}

export async function findActiveIngestKey(token: string): Promise<IngestKeyScope | null> {
  if (!token.startsWith(PREFIX)) return null;
  const row = await prisma.client.ingestKey.findUnique({
    where: { keyHash: hash(token) },
    select: {
      teamId: true,
      revokedAt: true,
      team: {
        select: {
          deletedAt: true,
          websites: {
            where: { deletedAt: null },
            select: { id: true, name: true },
            orderBy: { name: 'asc' },
          },
        },
      },
    },
  });
  if (!row || row.revokedAt || row.team.deletedAt) return null;
  return { teamId: row.teamId, websites: row.team.websites };
}

export async function createIngestKey(websiteId: string, name: string) {
  const teamId = await teamForWebsite(websiteId);
  if (!teamId) return null;
  const generated = generateIngestToken();
  const id = uuid();
  await prisma.client.ingestKey.create({
    data: {
      id,
      teamId,
      name,
      keyHash: generated.keyHash,
      keyPrefix: generated.keyPrefix,
    },
  });
  return { id, name, prefix: generated.keyPrefix, token: generated.token, teamId };
}

export async function listIngestKeys(websiteId: string) {
  const website = await prisma.client.website.findFirst({
    where: { id: websiteId, deletedAt: null },
    select: { teamId: true },
  });
  if (!website?.teamId) return [];
  return prisma.client.ingestKey.findMany({
    where: { teamId: website.teamId },
    select: {
      id: true,
      name: true,
      keyPrefix: true,
      revokedAt: true,
      createdAt: true,
      rotatedFromId: true,
    },
    orderBy: { createdAt: 'desc' },
  });
}

export async function revokeIngestKey(websiteId: string, keyId: string) {
  const website = await prisma.client.website.findFirst({
    where: { id: websiteId, deletedAt: null },
    select: { teamId: true },
  });
  if (!website?.teamId) return 0;
  const result = await prisma.client.ingestKey.updateMany({
    where: { id: keyId, teamId: website.teamId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  return result.count;
}

export async function rotateIngestKey(websiteId: string, keyId: string) {
  const website = await prisma.client.website.findFirst({
    where: { id: websiteId, deletedAt: null },
    select: { teamId: true },
  });
  if (!website?.teamId) return null;
  const existing = await prisma.client.ingestKey.findFirst({
    where: { id: keyId, teamId: website.teamId, revokedAt: null },
  });
  if (!existing) return null;
  const generated = generateIngestToken();
  const id = uuid();
  await prisma.transaction(async (tx: any) => {
    await tx.ingestKey.update({ where: { id: keyId }, data: { revokedAt: new Date() } });
    await tx.ingestKey.create({
      data: {
        id,
        teamId: website.teamId,
        name: existing.name,
        keyHash: generated.keyHash,
        keyPrefix: generated.keyPrefix,
        rotatedFromId: keyId,
      },
    });
  });
  return { id, name: existing.name, prefix: generated.keyPrefix, token: generated.token };
}
