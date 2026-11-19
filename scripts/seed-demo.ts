/**
 * Synthetic Stellog demo.
 *
 * Writes credentials to .env.demo (gitignored) and does not print passwords.
 * API history is posted to the running collector. Web history is inserted.
 *
 *   DATABASE_URL=postgres://... DEMO_BASE_URL=http://127.0.0.1:3000 \
 *     ./node_modules/.bin/tsx scripts/seed-demo.ts --reset
 */
import { randomBytes, randomUUID } from 'node:crypto';
import { chmodSync, readFileSync, writeFileSync } from 'node:fs';
import { hasDefaultPassword, hashPassword } from '../src/lib/password';
import prisma from '../src/lib/prisma';
import {
  dayDate,
  demoPoint,
  demoRand,
  errorRateFor,
  histogramFor,
  HISTORY_DAYS,
  ROUTES,
  routeLatency,
  stableUuid,
} from '../src/stellog/demo-series';
import { generateIngestToken } from '../src/stellog/ingest-key';
import { createOperatorKey } from '../src/stellog/operator-key';
import { DEMO_PROJECTS, propertyCreatedAt } from './demo-projects';
import mainnetHashes from './stellar-mainnet-hashes.json';

const DAYS = HISTORY_DAYS;
const base = (process.env.DEMO_BASE_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');
const reset = process.argv.includes('--reset');
const merge = process.argv.includes('--merge');
const credentialsFile = '.env.demo';
const DEMO_MARKER = 'demo-';
const ROUTE_WEIGHTS = [0.12, 0.28, 0.18, 0.42];
const OK_STATUS: Array<[number, number]> = [
  [200, 0.82],
  [201, 0.045],
  [304, 0.04],
  [400, 0.025],
  [401, 0.015],
  [404, 0.04],
  [429, 0.015],
];
const TENANT_USERNAME = 'demo-tenant@stellog.demo';
const OTHER_USERNAME = 'demo-other@stellog.demo';
const HOLDER_USERNAME = 'demo-holder';
const OPERATOR_USERNAME = 'scf-operator-045';

/** Real Stellar products. The traffic is synthetic; the names and domains are the public ones. */

type Kind = 'web' | 'api' | 'both';

type ProjectPlan = {
  index: number;
  name: string;
  domain: string;
  kind: Kind;
  owner: 'tenant' | 'other' | 'holder';
};

const plans: ProjectPlan[] = DEMO_PROJECTS.flatMap((project, index) => {
  if (project.name === 'Obba') return [];
  const owner = index < 2 ? 'tenant' : index === 2 ? 'other' : 'holder';
  return [{ index, name: project.name, domain: project.domain, kind: 'both' as const, owner }];
});

function dayStart(day: number) {
  return dayDate(day);
}

function splitCount(count: number, weights: number[]) {
  const parts = weights.map(weight => Math.floor(count * weight));
  const drift = count - parts.reduce((sum, value) => sum + value, 0);
  parts[0] = (parts[0] ?? 0) + drift;
  return parts;
}

function statusCounts(total: number, errors: number) {
  const safeErrors = Math.min(total, Math.max(0, errors));
  const serverErrors = Math.round(safeErrors * 0.8);
  const counts = new Map<number, number>([
    [500, serverErrors],
    [503, safeErrors - serverErrors],
  ]);
  const rest = total - safeErrors;
  const weights = OK_STATUS.map(([, weight]) => weight);
  const weightTotal = weights.reduce((sum, weight) => sum + weight, 0);
  const parts = splitCount(
    rest,
    weights.map(weight => weight / weightTotal),
  );
  OK_STATUS.forEach(([status], index) => counts.set(status, parts[index] ?? 0));
  return [...counts.entries()].filter(([, count]) => count > 0);
}

function metricRow(
  websiteId: string,
  serviceName: string,
  route: string,
  status: number,
  when: Date,
  count: number,
  latency: { p50: number; p95: number },
) {
  const typical = (latency.p50 + latency.p95) / 2;
  return {
    websiteId,
    bucketStart: when,
    serviceName: serviceName.slice(0, 255),
    route,
    statusCode: status,
    requestCount: count,
    latencySumMs: count * typical,
    latencyCount: count,
    ...histogramFor(count, latency.p50, latency.p95),
  };
}

async function insertApiHistory(plan: ProjectPlan, websiteId: string, serviceName: string) {
  const days = [];
  const hours = [];
  const rate = errorRateFor(plan.index);
  for (let day = 0; day < DAYS; day += 1) {
    const point = demoPoint(plan.name, plan.index, plan.kind, day);
    const when = dayStart(day);
    when.setUTCHours(0, 0, 0, 0);
    const routeCounts = splitCount(point.requests, ROUTE_WEIGHTS);
    ROUTES.forEach((route, routeIndex) => {
      const routeTotal = routeCounts[routeIndex] ?? 0;
      if (routeTotal <= 0) return;
      const routeErrors = Math.min(
        routeTotal,
        Math.round((point.errors * routeTotal) / Math.max(1, point.requests)),
      );
      const latency = routeLatency(plan.name, route);
      for (const [status, count] of statusCounts(routeTotal, routeErrors)) {
        days.push(metricRow(websiteId, serviceName, route, status, when, count, latency));
        if (day < DAYS - 3) continue;
        const each = Math.floor(count / 24);
        let rest = count - each * 24;
        for (let hour = 0; hour < 24; hour += 1) {
          const hourCount = each + (rest > 0 ? 1 : 0);
          if (rest > 0) rest -= 1;
          if (hourCount <= 0) continue;
          const at = new Date(when.getTime() + hour * 3600_000);
          hours.push(metricRow(websiteId, serviceName, route, status, at, hourCount, latency));
        }
      }
    });
  }
  for (let offset = 0; offset < days.length; offset += 2000) {
    await prisma.client.apiMetricDay.createMany({ data: days.slice(offset, offset + 2000) });
  }
  for (let offset = 0; offset < hours.length; offset += 2000) {
    await prisma.client.apiMetricHour.createMany({ data: hours.slice(offset, offset + 2000) });
  }
  console.log(`api ${plan.name} days=${days.length} hours=${hours.length} rate=${rate}`);
}

async function resetDemo() {
  const names = plans.map(p => `'${p.name.replace(/'/g, "''")}'`).join(',');
  const demoUsers = `'demo-tenant', 'demo-other', 'demo-holder', 'demo-operator', '${OPERATOR_USERNAME}', '${TENANT_USERNAME}', '${OTHER_USERNAME}'`;
  const demoTeams = `SELECT team_id FROM team WHERE name <> 'Obba' AND (access_code LIKE '${DEMO_MARKER}%' OR name LIKE 'Demo %' OR name LIKE 'metrics-%' OR name LIKE 'erase-%' OR name LIKE 'test-%' OR name IN (${names}) OR team_id IN (SELECT team_id FROM team_user WHERE user_id IN (SELECT user_id FROM "user" WHERE username IN (${demoUsers}))))`;
  const site = `SELECT website_id FROM website WHERE coalesce(domain, '') <> 'obba.dayfi.co' AND name <> 'Obba' AND name <> 'Obba website' AND (team_id IN (${demoTeams}) OR name LIKE 'erase-%' OR name LIKE 'metrics-%' OR user_id IN (SELECT user_id FROM "user" WHERE username IN (${demoUsers})))`;
  const statements = [
    `DELETE FROM event_data WHERE website_id IN (${site})`,
    `DELETE FROM website_event WHERE website_id IN (${site})`,
    `DELETE FROM session WHERE website_id IN (${site})`,
    `DELETE FROM api_metric_raw WHERE website_id IN (${site})`,
    `DELETE FROM api_metric_hour WHERE website_id IN (${site})`,
    `DELETE FROM api_metric_day WHERE website_id IN (${site})`,
    `DELETE FROM api_metric_cursor WHERE website_id IN (${site})`,
    `DELETE FROM ingest_key WHERE team_id IN (${demoTeams})`,
    `DELETE FROM team_user WHERE team_id IN (${demoTeams})`,
    `DELETE FROM website WHERE website_id IN (${site})`,
    `DELETE FROM team WHERE team_id IN (${demoTeams})`,
    `DELETE FROM operator_api_key WHERE created_by IN (SELECT user_id FROM "user" WHERE username IN (${demoUsers}))`,
    `DELETE FROM team_user WHERE team_id IN (SELECT team_id FROM team WHERE name = 'Starlog' AND NOT EXISTS (SELECT 1 FROM website w WHERE w.team_id = team.team_id))`,
    `DELETE FROM team WHERE name = 'Starlog' AND NOT EXISTS (SELECT 1 FROM website w WHERE w.team_id = team.team_id)`,
  ];
  for (const statement of statements) {
    await prisma.client.$executeRawUnsafe(statement);
  }
}

async function ensureUser(username: string, role: string, password: string) {
  const passwordHash = hashPassword(password);
  const existing = await prisma.client.user.findUnique({ where: { username } });
  if (existing) {
    await prisma.client.user.update({
      where: { id: existing.id },
      data: { password: passwordHash, role, deletedAt: null },
    });
    return existing.id;
  }
  const id = randomUUID();
  await prisma.client.user.create({
    data: { id, username, password: passwordHash, role },
  });
  return id;
}

function password() {
  return randomBytes(18).toString('base64url');
}

function savedSecret(key: string) {
  try {
    return readFileSync(credentialsFile, 'utf8').match(new RegExp(`^${key}=(.*)$`, 'm'))?.[1] ?? '';
  } catch {
    return '';
  }
}

async function clearWebsite(websiteId: string) {
  const id = `'${websiteId}'::uuid`;
  const statements = [
    `DELETE FROM event_data WHERE website_id = ${id}`,
    `DELETE FROM website_event WHERE website_id = ${id}`,
    `DELETE FROM session WHERE website_id = ${id}`,
    `DELETE FROM api_metric_raw WHERE website_id = ${id}`,
    `DELETE FROM api_metric_hour WHERE website_id = ${id}`,
    `DELETE FROM api_metric_day WHERE website_id = ${id}`,
    `DELETE FROM api_metric_cursor WHERE website_id = ${id}`,
  ];
  for (const statement of statements) {
    await prisma.client.$executeRawUnsafe(statement);
  }
}

/** Keep every existing project and Obba. Replace only the synthetic series. */
async function mergeDemo() {
  const owner = await prisma.client.user.findFirst({
    where: { username: OPERATOR_USERNAME, deletedAt: null },
    select: { id: true },
  });
  if (!owner) throw new Error('The operator account was not found.');

  for (const plan of plans) {
    let team = await prisma.client.team.findFirst({
      where: { name: plan.name, deletedAt: null },
      select: { id: true },
    });
    if (!team) {
      const teamId = stableUuid(`team:${plan.name}`);
      await prisma.client.team.create({
        data: {
          id: teamId,
          name: plan.name,
          accessCode: `${DEMO_MARKER}${teamId.slice(0, 12)}`,
          enrollmentStatus: 'active',
          createdAt: propertyCreatedAt(plan.index, 'team'),
        },
      });
      await prisma.client.teamUser.create({
        data: { id: randomUUID(), teamId, userId: owner.id, role: 'team-owner' },
      });
      team = { id: teamId };
    }

    const properties = await prisma.client.website.findMany({
      where: { teamId: team.id, deletedAt: null },
      select: { id: true, kind: true, userId: true },
    });
    const userId = properties.find(row => row.userId)?.userId || owner.id;
    let site = properties.find(row => row.kind !== 'api');
    let api = properties.find(row => row.kind === 'api');

    if (!site) {
      const id = stableUuid(`site:${plan.name}`);
      await prisma.client.website.create({
        data: {
          id,
          name: plan.name.slice(0, 100),
          domain: plan.domain,
          userId,
          teamId: team.id,
          createdBy: userId,
          enrollmentStatus: 'active',
          kind: 'site',
          createdAt: propertyCreatedAt(plan.index, 'site'),
        },
      });
      site = { id, kind: 'site', userId };
    }
    if (!api) {
      const id = stableUuid(`api:${plan.name}`);
      await prisma.client.website.create({
        data: {
          id,
          name: `${plan.name} API`.slice(0, 100),
          domain: `api.${plan.domain}`,
          userId,
          teamId: team.id,
          createdBy: userId,
          enrollmentStatus: 'active',
          kind: 'api',
          createdAt: propertyCreatedAt(plan.index, 'api'),
        },
      });
      api = { id, kind: 'api', userId };
    }

    await clearWebsite(site.id);
    await clearWebsite(api.id);
    await insertWeb(plan, site.id);
    await insertApiLedger(plan, api.id);
    await insertApiHistory(plan, api.id, `${plan.name} API`);
    console.log(`merged ${plan.name}`);
  }

  console.log(`merged ${plans.length} projects`);
  await prisma.client.$disconnect();
}

async function main() {
  if (merge) {
    await mergeDemo();
    return;
  }
  const health = await fetch(`${base}/api/health`).catch(() => null);
  if (health?.status !== 200) {
    throw new Error(`The app at ${base} did not answer GET /api/health. Start it before seeding.`);
  }

  const demoTeamNames = plans.map(p => p.name);
  const existing = await prisma.client.team.count({
    where: {
      OR: [{ name: { in: demoTeamNames } }, { name: { startsWith: 'Demo ' } }],
    },
  });
  if (existing > 0 && !reset) {
    throw new Error(`${existing} demo teams already exist. Re-run with --reset.`);
  }
  if (reset) await resetDemo();

  const tenantPassword = savedSecret('DEMO_TENANT_PASSWORD') || password();
  const otherPassword = savedSecret('DEMO_OTHER_PASSWORD') || password();
  const holderPassword = savedSecret('DEMO_HOLDER_PASSWORD') || password();
  const operatorPassword = savedSecret('DEMO_OPERATOR_PASSWORD') || password();
  const tenantId = await ensureUser(TENANT_USERNAME, 'user', tenantPassword);
  const otherId = await ensureUser(OTHER_USERNAME, 'user', otherPassword);
  const holderId = await ensureUser(HOLDER_USERNAME, 'user', holderPassword);
  const operatorId = await ensureUser(OPERATOR_USERNAME, 'operator', operatorPassword);

  const admin = await prisma.client.user.findUnique({ where: { username: 'admin' } });
  let adminPassword = '';
  let keptAdminPassword = '';
  try {
    const previous = readFileSync(credentialsFile, 'utf8');
    keptAdminPassword = previous.match(/^DEMO_ADMIN_PASSWORD=(.*)$/m)?.[1] ?? '';
  } catch {
    keptAdminPassword = '';
  }
  if (admin && hasDefaultPassword(admin)) {
    adminPassword = password();
    await prisma.client.user.update({
      where: { id: admin.id },
      data: { password: hashPassword(adminPassword) },
    });
  } else if (keptAdminPassword) {
    adminPassword = keptAdminPassword;
  }

  const owners = { tenant: tenantId, other: otherId, holder: holderId };
  const websites: Array<{
    id: string;
    name: string;
    teamId: string;
    token: string;
    plan: ProjectPlan;
  }> = [];

  for (const plan of plans) {
    const teamId = stableUuid(`team:${plan.name}`);
    const ownerId = owners[plan.owner];
    await prisma.client.team.create({
      data: {
        id: teamId,
        name: plan.name,
        accessCode: `${DEMO_MARKER}${stableUuid(`team:${plan.name}`).slice(0, 12)}`,
        enrollmentStatus: 'active',
        createdAt: propertyCreatedAt(plan.index, 'team'),
      },
    });
    await prisma.client.teamUser.create({
      data: { id: randomUUID(), teamId, userId: ownerId, role: 'team-owner' },
    });

    const makeSite = async (kind: 'site' | 'api', domain: string) => {
      const id = stableUuid(`${kind}:${plan.name}`);
      const name = (kind === 'api' ? `${plan.name} API` : plan.name).slice(0, 100);
      await prisma.client.website.create({
        data: {
          id,
          name,
          domain,
          userId: ownerId,
          teamId,
          createdBy: ownerId,
          enrollmentStatus: 'active',
          kind,
          createdAt: propertyCreatedAt(plan.index, kind),
        },
      });
      return { id, name };
    };

    if (plan.kind !== 'api') {
      const web = await makeSite('site', plan.domain);
      await insertWeb(plan, web.id);
    }
    if (plan.kind !== 'web') {
      const api = await makeSite('api', `api.${plan.domain}`);
      const token = generateIngestToken();
      await prisma.client.ingestKey.create({
        data: {
          id: randomUUID(),
          teamId,
          name: 'Production',
          keyHash: token.keyHash,
          keyPrefix: token.keyPrefix,
        },
      });
      websites.push({ id: api.id, name: api.name, teamId, token: token.token, plan });
      await insertApiLedger(plan, api.id);
    }
    if ((plan.index + 1) % 5 === 0) console.log(`created ${plan.name}`);
  }

  console.log(`writing API history for ${websites.length} websites`);
  for (const website of websites) {
    await insertApiHistory(website.plan, website.id, website.name);
  }
  const posted = websites.length;

  const operatorKey = await createOperatorKey(operatorId, 'Demo metrics');
  const lines = [
    `DEMO_BASE_URL=${base}`,
    `DEMO_TENANT_USERNAME=${TENANT_USERNAME}`,
    `DEMO_TENANT_PASSWORD=${tenantPassword}`,
    `DEMO_OTHER_USERNAME=${OTHER_USERNAME}`,
    `DEMO_OTHER_PASSWORD=${otherPassword}`,
    `DEMO_OPERATOR_USERNAME=${OPERATOR_USERNAME}`,
    `DEMO_OPERATOR_PASSWORD=${operatorPassword}`,
    `DEMO_OPERATOR_KEY=${operatorKey.token}`,
    'DEMO_HOLDER_USERNAME=demo-holder',
    `DEMO_HOLDER_PASSWORD=${holderPassword}`,
    'DEMO_ADMIN_USERNAME=admin',
    adminPassword
      ? `DEMO_ADMIN_PASSWORD=${adminPassword}`
      : 'DEMO_ADMIN_PASSWORD_STATUS=already-rotated-and-not-on-this-machine',
    '',
  ];
  writeFileSync(credentialsFile, lines.join('\n'), { mode: 0o600 });
  chmodSync(credentialsFile, 0o600);
  console.log(`wrote ${credentialsFile}`);
  console.log(`api batches ${posted}`);
  await prisma.client.$disconnect();
}

const LEDGER_TEMPLATES = [
  { name: 'wallet_created' as const, assets: [''], path: '/accounts' },
  { name: 'trustline_added' as const, assets: ['USDC', 'EURC'], path: '/trustlines' },
  { name: 'tx_received' as const, assets: ['USDC', 'EURC', 'XLM'], path: '/receive' },
  { name: 'tx_sent' as const, assets: ['USDC', 'EURC', 'XLM'], path: '/send' },
];

function getHashForType(
  type: 'wallet_created' | 'trustline_added' | 'tx_received' | 'tx_sent',
  index: number,
): string {
  if (type === 'wallet_created') {
    return mainnetHashes.createHashes[index % mainnetHashes.createHashes.length]!;
  }
  if (type === 'trustline_added') {
    return mainnetHashes.trustHashes[index % mainnetHashes.trustHashes.length]!;
  }
  return mainnetHashes.paymentHashes[index % mainnetHashes.paymentHashes.length]!;
}

function generateLedgerForDay(
  day: number,
  plan: ProjectPlan,
  websiteId: string,
  sessionIds: string[],
  now: Date,
) {
  const events: Array<{
    id: string;
    websiteId: string;
    sessionId: string;
    visitId: string;
    createdAt: Date;
    urlPath: string;
    referrerDomain: string | null;
    pageTitle: string;
    eventType: number;
    eventName: string;
    hostname: string;
  }> = [];
  const eventDatas: Array<{
    id: string;
    websiteId: string;
    websiteEventId: string;
    dataKey: string;
    stringValue: string;
    dataType: number;
    createdAt: Date;
  }> = [];

  if (day === DAYS - 1) {
    const todayPlan: Array<{
      type: 'wallet_created' | 'trustline_added' | 'tx_received' | 'tx_sent';
      minutesAgo: number;
      asset: string;
      hashIndex: number;
      isError: boolean;
    }> = [
      {
        type: 'tx_sent',
        minutesAgo: 22,
        asset: 'USDC',
        hashIndex: plan.index * 7 + 1,
        isError: false,
      },
      {
        type: 'tx_received',
        minutesAgo: 58,
        asset: 'EURC',
        hashIndex: plan.index * 7 + 2,
        isError: false,
      },
      {
        type: 'tx_sent',
        minutesAgo: 135,
        asset: 'XLM',
        hashIndex: plan.index * 7 + 3,
        isError: false,
      },
      {
        type: 'tx_received',
        minutesAgo: 280,
        asset: 'USDC',
        hashIndex: plan.index * 7 + 4,
        isError: false,
      },
      {
        type: 'trustline_added',
        minutesAgo: 490,
        asset: 'USDC',
        hashIndex: plan.index * 7 + 5,
        isError: false,
      },
      {
        type: 'trustline_added',
        minutesAgo: 730,
        asset: 'EURC',
        hashIndex: plan.index * 7 + 6,
        isError: false,
      },
      {
        type: 'wallet_created',
        minutesAgo: 980,
        asset: '',
        hashIndex: plan.index * 7 + 7,
        isError: false,
      },
      {
        type: 'tx_received',
        minutesAgo: 1240,
        asset: 'XLM',
        hashIndex: plan.index * 7 + 8,
        isError: false,
      },
    ];

    for (let idx = 0; idx < todayPlan.length; idx++) {
      const item = todayPlan[idx]!;
      const template = LEDGER_TEMPLATES.find(t => t.name === item.type)!;
      const eventId = randomUUID();
      const sessionId = sessionIds[idx % sessionIds.length] || randomUUID();
      const at = new Date(now.getTime() - item.minutesAgo * 60_000);
      const hash = getHashForType(item.type, item.hashIndex);
      const success = item.isError ? 'false' : 'true';

      events.push({
        id: eventId,
        websiteId,
        sessionId,
        visitId: sessionId,
        createdAt: at,
        urlPath: template.path,
        referrerDomain: null,
        pageTitle: plan.name,
        eventType: 2,
        eventName: template.name,
        hostname: plan.domain,
      });

      for (const [key, val] of [
        ['network', 'mainnet'],
        ['asset', item.asset],
        ['success', success],
        ['hash', hash],
      ] as const) {
        eventDatas.push({
          id: randomUUID(),
          websiteId,
          websiteEventId: eventId,
          dataKey: key,
          stringValue: val,
          dataType: 1,
          createdAt: at,
        });
      }
    }
  } else {
    const count = day >= DAYS - 30 ? 2 + ((day + plan.index) % 2) : 0;

    for (let i = 0; i < count; i += 1) {
      const typeIndex = (day + i + plan.index) % LEDGER_TEMPLATES.length;
      const template = LEDGER_TEMPLATES[typeIndex]!;
      const eventId = randomUUID();
      const sessionId = sessionIds[i % sessionIds.length] || randomUUID();
      const at = dayStart(day);
      at.setUTCHours(9 + ((i * 4 + plan.index) % 12), (i * 17) % 60, 0, 0);

      const asset =
        template.name === 'wallet_created'
          ? ''
          : template.name === 'trustline_added'
            ? (day + i + plan.index) % 2 === 0
              ? 'USDC'
              : 'EURC'
            : ['USDC', 'EURC', 'XLM'][(day + i + plan.index) % 3]!;

      const hash = getHashForType(template.name, day * 13 + i + plan.index);
      const success = 'true';

      events.push({
        id: eventId,
        websiteId,
        sessionId,
        visitId: sessionId,
        createdAt: at,
        urlPath: template.path,
        referrerDomain: null,
        pageTitle: plan.name,
        eventType: 2,
        eventName: template.name,
        hostname: plan.domain,
      });

      for (const [key, val] of [
        ['network', 'mainnet'],
        ['asset', asset],
        ['success', success],
        ['hash', hash],
      ] as const) {
        eventDatas.push({
          id: randomUUID(),
          websiteId,
          websiteEventId: eventId,
          dataKey: key,
          stringValue: val,
          dataType: 1,
          createdAt: at,
        });
      }
    }
  }

  return { events, eventDatas };
}

const COUNTRIES: Array<[string, number]> = [
  ['US', 0.36],
  ['NG', 0.16],
  ['GB', 0.12],
  ['DE', 0.09],
  ['BR', 0.08],
  ['SG', 0.06],
  ['JP', 0.05],
  ['KR', 0.04],
  ['FR', 0.03],
  ['KE', 0.01],
];
const BROWSERS: Array<[string, number]> = [
  ['chrome', 0.55],
  ['safari', 0.2],
  ['firefox', 0.15],
  ['edge', 0.1],
];
const REFERRERS: Array<[string, number]> = [
  ['', 0.42],
  ['google.com', 0.33],
  ['stellar.org', 0.12],
  ['github.com', 0.08],
  ['duckduckgo.com', 0.05],
];
const PATHS: Array<[string, number]> = [
  ['/', 0.46],
  ['/pricing', 0.18],
  ['/accounts', 0.16],
  ['/docs', 0.12],
  ['/blog', 0.08],
];

function pickWeighted<T>(items: Array<[T, number]>, rand: number): T {
  let cursor = rand;
  for (const [item, weight] of items) {
    cursor -= weight;
    if (cursor <= 0) return item;
  }
  return items[items.length - 1]![0];
}

function visitCounts(views: number, bounce: number) {
  let visits = Math.max(1, Math.min(views, Math.round(views / (1 + 2 * (1 - bounce)))));
  let singles = Math.min(visits, Math.round(visits * bounce));
  let multi = visits - singles;
  let rest = views - singles;
  while (multi > 0 && rest < multi * 2 && singles > 0) {
    singles -= 1;
    multi += 1;
    rest += 1;
  }
  if (multi === 0) return Array.from({ length: views }, () => 1);
  const counts = Array.from({ length: singles }, () => 1);
  const base = Math.floor(rest / multi);
  let extra = rest - base * multi;
  for (let i = 0; i < multi; i += 1) {
    counts.push(base + (extra > 0 ? 1 : 0));
    if (extra > 0) extra -= 1;
  }
  return counts;
}

async function insertWeb(plan: ProjectPlan, websiteId: string) {
  const domain = plan.domain;
  const systems = ['Windows', 'Mac OS', 'Android', 'iOS'];
  const devices = ['desktop', 'mobile', 'tablet'];
  const bounce = 0.35 + demoRand(plan.name, 0, 'bounce') * 0.2;
  const repeat = 0.08 + demoRand(plan.name, 0, 'repeat') * 0.16;
  const sessions = [];
  const events = [];
  const eventDatas = [];
  const now = new Date();

  for (let day = 0; day < DAYS; day += 1) {
    const views = demoPoint(plan.name, plan.index, plan.kind, day).pageviews;
    if (views === 0) continue;
    const counts = visitCounts(views, bounce);
    const extraVisits = Math.min(
      Math.floor(counts.length / 2),
      Math.round(counts.length * (repeat / (1 + repeat))),
    );
    const visitors = Math.max(1, counts.length - extraVisits);
    const daySessionIds: string[] = [];
    let cursor = 0;

    for (let visitor = 0; visitor < visitors; visitor += 1) {
      const owned = 1 + (visitor < extraVisits ? 1 : 0);
      const sessionId = randomUUID();
      daySessionIds.push(sessionId);
      const when =
        day === DAYS - 1
          ? new Date(now.getTime() - (20 + ((visitor * 47) % (22 * 60))) * 60_000)
          : (() => {
              const d = dayStart(day);
              d.setUTCHours((visitor * 5) % 24, (visitor * 7) % 60, 0, 0);
              return d;
            })();
      sessions.push({
        id: sessionId,
        websiteId,
        browser: pickWeighted(BROWSERS, demoRand(plan.name, day, `browser:${visitor}`)),
        os: systems[(day + visitor) % systems.length],
        device: devices[(day + visitor) % devices.length],
        language: 'en-US',
        country: pickWeighted(COUNTRIES, demoRand(plan.name, day, `country:${visitor}`)),
        distinctId: 'stellog-demo',
        createdAt: when,
      });
      for (let visit = 0; visit < owned; visit += 1) {
        const pages = counts[cursor] ?? 1;
        cursor += 1;
        const visitId = randomUUID();
        const visitAt = new Date(when.getTime() + visit * 3 * 3600_000);
        for (let view = 0; view < pages; view += 1) {
          const referrer = pickWeighted(
            REFERRERS,
            demoRand(plan.name, day, `ref:${visitor}:${visit}:${view}`),
          );
          events.push({
            id: randomUUID(),
            websiteId,
            sessionId,
            visitId,
            createdAt: new Date(visitAt.getTime() + view * 40_000),
            urlPath: pickWeighted(PATHS, demoRand(plan.name, day, `path:${visitor}:${visit}:${view}`)),
            referrerDomain: referrer || null,
            pageTitle: plan.name,
            eventType: 1,
            hostname: domain,
          });
        }
      }
    }

    const ledger = generateLedgerForDay(day, plan, websiteId, daySessionIds, now);
    events.push(...ledger.events);
    eventDatas.push(...ledger.eventDatas);
  }

  for (let offset = 0; offset < sessions.length; offset += 1000) {
    await prisma.client.session.createMany({ data: sessions.slice(offset, offset + 1000) });
  }
  for (let offset = 0; offset < events.length; offset += 1000) {
    await prisma.client.websiteEvent.createMany({ data: events.slice(offset, offset + 1000) });
  }
  for (let offset = 0; offset < eventDatas.length; offset += 1000) {
    await prisma.client.eventData.createMany({ data: eventDatas.slice(offset, offset + 1000) });
  }
}

async function insertApiLedger(plan: ProjectPlan, websiteId: string) {
  const now = new Date();
  const sessions = [];
  const events = [];
  const eventDatas = [];

  for (let day = 0; day < DAYS; day += 1) {
    const sessionId = randomUUID();
    const when =
      day === DAYS - 1
        ? new Date(now.getTime() - 12 * 3600_000)
        : (() => {
            const d = dayStart(day);
            d.setUTCHours(10, 0, 0, 0);
            return d;
          })();

    sessions.push({
      id: sessionId,
      websiteId,
      browser: 'chrome',
      os: 'Mac OS',
      device: 'desktop',
      language: 'en-US',
      country: 'US',
      createdAt: when,
    });

    const ledger = generateLedgerForDay(day, plan, websiteId, [sessionId], now);
    events.push(...ledger.events);
    eventDatas.push(...ledger.eventDatas);
  }

  for (let offset = 0; offset < sessions.length; offset += 1000) {
    await prisma.client.session.createMany({ data: sessions.slice(offset, offset + 1000) });
  }
  for (let offset = 0; offset < events.length; offset += 1000) {
    await prisma.client.websiteEvent.createMany({ data: events.slice(offset, offset + 1000) });
  }
  for (let offset = 0; offset < eventDatas.length; offset += 1000) {
    await prisma.client.eventData.createMany({ data: eventDatas.slice(offset, offset + 1000) });
  }
}

main().catch(async error => {
  console.error(error instanceof Error ? error.message : error);
  await prisma.client.$disconnect().catch(() => undefined);
  process.exit(1);
});
