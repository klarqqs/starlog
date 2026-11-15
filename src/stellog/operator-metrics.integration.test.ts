import 'dotenv/config';
import { afterAll, describe, expect, test } from 'vitest';
import { uuid } from '@/lib/crypto';
import { hashPassword } from '@/lib/password';
import prisma from '@/lib/prisma';
import { deleteTeam } from '@/queries/prisma/team';
import { emptyHist, histForLatency } from './histogram';
import {
  createOperatorKey,
  findActiveOperatorKey,
  listOperatorKeys,
  revokeOperatorKey,
} from './operator-key';
import { readOperatorProjects } from './operator-metrics';
import { projectId } from './operator-report';

const databaseUrl = process.env.DATABASE_URL;
const start = new Date('2020-03-01T15:00:00.000Z');
const end = new Date('2020-03-01T16:00:00.000Z');

(databaseUrl ? describe : describe.skip)('operator project metrics', () => {
  const keys: string[] = [];

  afterAll(async () => {
    if (keys.length) {
      await prisma.client.operatorApiKey.deleteMany({ where: { id: { in: keys } } });
    }
    for (const teamId of teams) {
      await deleteTeam(teamId).catch(() => undefined);
    }
    if (users.length) {
      await prisma.client.user.deleteMany({ where: { id: { in: users } } });
    }
  });

  test('team A does not include team B, and a pending property is left out', async () => {
    const suffix = uuid().slice(0, 8);
    const teamA = await makeTeam(`Operator Alpha ${suffix}`);
    const teamB = await makeTeam(`Operator Beta ${suffix}`);
    const websiteA = await makeWebsite(teamA, `alpha-web-${suffix}`, 'active');
    const websitePending = await makeWebsite(teamA, `alpha-wait-${suffix}`, 'pending');
    const websiteB = await makeWebsite(teamB, `beta-web-${suffix}`, 'active');

    const sessionId = uuid();
    await prisma.client.session.create({ data: { id: sessionId, websiteId: websiteA } });
    await prisma.client.websiteEvent.create({
      data: {
        id: uuid(),
        websiteId: websiteA,
        sessionId,
        visitId: uuid(),
        urlPath: '/',
        eventType: 1,
        createdAt: start,
      },
    });
    await prisma.client.apiMetricHour.createMany({
      data: [hour(websiteA, 4, 200), hour(websitePending, 100, 500), hour(websiteB, 9, 200)],
    });

    const ranked = await readOperatorProjects(start, end, {
      q: suffix,
      status: 'all',
      sort: 'name',
      order: 'asc',
    });
    const alpha = ranked.find(project => project.id === projectId('team', teamA));
    const beta = ranked.find(project => project.id === projectId('team', teamB));

    expect(alpha).toMatchObject({
      pageviews: 1,
      requests: 4,
      websiteIds: [websiteA],
      pendingProperties: 1,
    });
    expect(beta).toMatchObject({ pageviews: 0, requests: 9, websiteIds: [websiteB] });
    expect(JSON.stringify(alpha)).not.toContain(websiteB);
    expect(ranked.filter(project => project.name.includes('Alpha'))).toHaveLength(1);
  });

  test('an operator key is stored as a hash and stops working when revoked', async () => {
    const adminId = await makeAdmin();
    const created = await createOperatorKey(adminId, `operator-test-${uuid().slice(0, 8)}`);
    keys.push(created.id);

    const listed = await listOperatorKeys();
    const row = listed.find(key => key.id === created.id);
    expect(row?.keyPrefix).toBe(created.prefix);
    expect(JSON.stringify(row)).not.toContain(created.token);
    const stored = await prisma.client.operatorApiKey.findUnique({ where: { id: created.id } });
    expect(stored?.keyHash).not.toBe(created.token);
    expect(stored?.keyHash).toHaveLength(128);

    await expect(findActiveOperatorKey(created.token)).resolves.toEqual({ id: created.id });
    expect(await revokeOperatorKey(created.id)).toBe(1);
    await expect(findActiveOperatorKey(created.token)).resolves.toBeNull();
  });
});

async function makeAdmin() {
  const id = uuid();
  await prisma.client.user.create({
    data: {
      id,
      username: `ops-${id.slice(0, 8)}@example.com`,
      password: hashPassword('integration-test-password'),
      role: 'admin',
    },
  });
  users.push(id);
  return id;
}

async function makeTeam(name: string) {
  const id = uuid();
  await prisma.client.team.create({
    data: { id, name, accessCode: `team_${id.slice(0, 8)}` },
  });
  teams.push(id);
  return id;
}

async function makeWebsite(teamId: string, name: string, enrollmentStatus: 'active' | 'pending') {
  const id = uuid();
  await prisma.client.website.create({
    data: { id, name, teamId, enrollmentStatus },
  });
  return id;
}

function hour(websiteId: string, count: number, statusCode: number) {
  return {
    websiteId,
    bucketStart: start,
    serviceName: 'api',
    route: '/health',
    statusCode,
    requestCount: count,
    latencySumMs: 40 * count,
    latencyCount: count,
    ...emptyHist(),
    ...histForLatency(40, count),
  };
}

const teams: string[] = [];
const users: string[] = [];
