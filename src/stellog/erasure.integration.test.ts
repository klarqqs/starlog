import 'dotenv/config';
import { afterAll, describe, expect, test } from 'vitest';
import { uuid } from '@/lib/crypto';
import prisma from '@/lib/prisma';
import { eraseDistinctId, eraseTenant } from './erasure';

const databaseUrl = process.env.DATABASE_URL;

(databaseUrl ? describe : describe.skip)('erasure', () => {
  const teams: string[] = [];

  afterAll(async () => {
    for (const teamId of teams) {
      await prisma.client.team.delete({ where: { id: teamId } }).catch(() => undefined);
    }
  });

  test('clears one distinct id and leaves the other website alone', async () => {
    const teamId = uuid();
    const websiteA = uuid();
    const websiteB = uuid();
    teams.push(teamId);
    await prisma.client.team.create({ data: { id: teamId, name: 'erase' } });
    await prisma.client.website.createMany({
      data: [
        { id: websiteA, name: 'erase-a', teamId },
        { id: websiteB, name: 'erase-b', teamId },
      ],
    });
    const sessionA = uuid();
    const sessionB = uuid();
    await prisma.client.session.createMany({
      data: [
        { id: sessionA, websiteId: websiteA, distinctId: 'person-a' },
        { id: sessionB, websiteId: websiteB, distinctId: 'person-a' },
      ],
    });
    await prisma.client.sessionLink.create({
      data: { websiteId: websiteA, sessionId: sessionA, distinctId: 'person-a' },
    });

    const result = await eraseDistinctId(websiteA, 'person-a');
    expect(result.sessions).toBe(1);
    expect(result.links).toBe(1);
    expect(
      (await prisma.client.session.findUnique({ where: { id: sessionA } }))?.distinctId,
    ).toBeNull();
    expect((await prisma.client.session.findUnique({ where: { id: sessionB } }))?.distinctId).toBe(
      'person-a',
    );
  });

  test('eraseTenant removes the team', async () => {
    const teamId = uuid();
    teams.push(teamId);
    await prisma.client.team.create({ data: { id: teamId, name: 'gone' } });
    await prisma.client.website.create({ data: { id: uuid(), name: 'gone-web', teamId } });
    await eraseTenant(teamId);
    teams.splice(teams.indexOf(teamId), 1);
    expect(await prisma.client.team.findUnique({ where: { id: teamId } })).toBeNull();
  });
});
