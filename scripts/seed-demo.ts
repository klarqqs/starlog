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
import { generateIngestToken } from '../src/stellog/ingest-key';
import { createOperatorKey } from '../src/stellog/operator-key';

const DAYS = 90;
const PROJECTS = 25;
const base = (process.env.DEMO_BASE_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');
const reset = process.argv.includes('--reset');
const credentialsFile = '.env.demo';
const BOUNDS = [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000];
const ROUTE_WEIGHTS = [0.28, 0.18, 0.16, 0.14, 0.14, 0.1];
const nouns = ['Wallet', 'Anchor', 'Explorer', 'Pay', 'Index'];

type Kind = 'web' | 'api' | 'both';
type Profile = 'steady' | 'growing' | 'declining' | 'errors' | 'spiky';

type ProjectPlan = {
  index: number;
  name: string;
  kind: Kind;
  profile: Profile;
  owner: 'tenant' | 'other' | 'holder';
};

const plans: ProjectPlan[] = Array.from({ length: PROJECTS }, (_, index) => {
  const kinds: Kind[] = ['both', 'web', 'api'];
  const profiles: Profile[] = ['steady', 'growing', 'declining', 'errors', 'spiky'];
  const kind: Kind = index === 0 ? 'both' : index === 1 ? 'web' : kinds[index % 3];
  const owner = index < 2 ? 'tenant' : index === 2 ? 'other' : 'holder';
  return {
    index,
    name: `Demo ${nouns[index % nouns.length]} ${String(index + 1).padStart(2, '0')}`,
    kind,
    profile: profiles[index % profiles.length],
    owner,
  };
});

function dayStart(day: number) {
  const date = new Date();
  date.setUTCHours(12, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() - (DAYS - 1 - day));
  return date;
}

function dailyRequests(profile: Profile, day: number) {
  if (profile === 'steady') return 480;
  if (profile === 'growing') return 20 + day * 5;
  if (profile === 'declining') return Math.max(15, 420 - day * 4);
  if (profile === 'errors') return 160;
  return day % 18 === 7 ? 900 : 25;
}

function dailyPageviews(profile: Profile, day: number) {
  if (profile === 'steady') return 80;
  if (profile === 'growing') return 8 + Math.round(day * 0.8);
  if (profile === 'declining') return Math.max(6, 90 - day);
  if (profile === 'errors') return 24;
  return day % 18 === 7 ? 220 : 12;
}

function errorShare(profile: Profile) {
  if (profile === 'errors') return 0.22;
  if (profile === 'spiky') return 0.06;
  return 0.02;
}

function buckets(count: number, profile: Profile) {
  const weights =
    profile === 'errors'
      ? [0, 0, 0, 0, 0.1, 0.25, 0.4, 0.25, 0, 0, 0, 0]
      : [0, 0.15, 0.35, 0.3, 0.15, 0.05, 0, 0, 0, 0, 0, 0];
  const counts = weights.map(weight => Math.floor(count * weight));
  const peak = weights.indexOf(Math.max(...weights));
  counts[peak] += count - counts.reduce((sum, value) => sum + value, 0);
  const mids = [2, 7, 17, 37, 75, 175, 375, 750, 1750, 3750, 7500, 15000];
  return {
    counts,
    sum: counts.reduce((total, value, index) => total + value * mids[index], 0),
  };
}

function routePath(route: number, day: number) {
  const account = `G${'A'.repeat(55)}`;
  const contract = `C${'C'.repeat(55)}`;
  const hash = `${(day % 16).toString(16).padStart(2, '0')}${'ab'.repeat(31)}`;
  const paths = [
    `/payments/${1000 + day}`,
    `/orders/11111111-1111-4111-8111-${String(111111111111 + day).padStart(12, '0')}`,
    `/accounts/${account}`,
    `/contracts/${contract}`,
    `/tx/${hash}`,
    '/health/',
  ];
  return paths[route] ?? '/health/';
}

async function resetDemo() {
  const site = `SELECT website_id FROM website WHERE team_id IN (SELECT team_id FROM team WHERE name LIKE 'Demo %')`;
  const statements = [
    `DELETE FROM website_event WHERE website_id IN (${site})`,
    `DELETE FROM session WHERE website_id IN (${site})`,
    `DELETE FROM api_metric_raw WHERE website_id IN (${site})`,
    `DELETE FROM api_metric_hour WHERE website_id IN (${site})`,
    `DELETE FROM api_metric_day WHERE website_id IN (${site})`,
    `DELETE FROM api_metric_cursor WHERE website_id IN (${site})`,
    `DELETE FROM ingest_key WHERE team_id IN (SELECT team_id FROM team WHERE name LIKE 'Demo %')`,
    `DELETE FROM team_user WHERE team_id IN (SELECT team_id FROM team WHERE name LIKE 'Demo %')`,
    `DELETE FROM website WHERE team_id IN (SELECT team_id FROM team WHERE name LIKE 'Demo %')`,
    `DELETE FROM team WHERE name LIKE 'Demo %'`,
    `DELETE FROM "user" WHERE username IN ('demo-tenant', 'demo-other', 'demo-holder', 'demo-operator')`,
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

async function postJson(path: string, token: string, body: unknown) {
  const response = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const text = (await response.text()).slice(0, 300);
    throw new Error(`${path} returned ${response.status}: ${text}`);
  }
}

function metricPoint(path: string, status: number, when: Date, count: number, profile: Profile) {
  const histogram = buckets(count, profile);
  return {
    attributes: [
      { key: 'http.route', value: { stringValue: path } },
      { key: 'http.response.status_code', value: { intValue: String(status) } },
    ],
    timeUnixNano: `${when.getTime()}000000`,
    count: String(count),
    sum: histogram.sum,
    explicitBounds: BOUNDS,
    bucketCounts: histogram.counts.map(String),
  };
}

async function main() {
  const health = await fetch(`${base}/api/health`).catch(() => null);
  if (health?.status !== 200) {
    throw new Error(`The app at ${base} did not answer GET /api/health. Start it before seeding.`);
  }

  const existing = await prisma.client.team.count({ where: { name: { startsWith: 'Demo ' } } });
  if (existing > 0 && !reset) {
    throw new Error(`${existing} demo teams already exist. Re-run with --reset.`);
  }
  if (reset) await resetDemo();

  const tenantPassword = password();
  const otherPassword = password();
  const holderPassword = password();
  const operatorPassword = password();
  const tenantId = await ensureUser('demo-tenant', 'user', tenantPassword);
  const otherId = await ensureUser('demo-other', 'user', otherPassword);
  const holderId = await ensureUser('demo-holder', 'user', holderPassword);
  const operatorId = await ensureUser('demo-operator', 'operator', operatorPassword);

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
    const teamId = randomUUID();
    const ownerId = owners[plan.owner];
    await prisma.client.team.create({
      data: { id: teamId, name: plan.name, enrollmentStatus: 'active' },
    });
    await prisma.client.teamUser.create({
      data: { id: randomUUID(), teamId, userId: ownerId, role: 'team-owner' },
    });

    const makeSite = async (suffix: string, domain: string) => {
      const id = randomUUID();
      const name = `${plan.name} ${suffix}`.slice(0, 100);
      await prisma.client.website.create({
        data: {
          id,
          name,
          domain,
          userId: ownerId,
          teamId,
          createdBy: ownerId,
          enrollmentStatus: 'active',
        },
      });
      return { id, name };
    };

    if (plan.kind !== 'api') {
      const web = await makeSite('site', `demo-${String(plan.index + 1).padStart(2, '0')}.example`);
      await insertWeb(plan, web.id);
    }
    if (plan.kind !== 'web') {
      const api = await makeSite(
        'api',
        `api.demo-${String(plan.index + 1).padStart(2, '0')}.example`,
      );
      const token = generateIngestToken();
      await prisma.client.ingestKey.create({
        data: {
          id: randomUUID(),
          teamId,
          name: 'Demo ingest',
          keyHash: token.keyHash,
          keyPrefix: token.keyPrefix,
        },
      });
      websites.push({ id: api.id, name: api.name, teamId, token: token.token, plan });
    }
    if ((plan.index + 1) % 5 === 0) console.log(`created ${plan.index + 1} of ${PROJECTS}`);
  }

  console.log(`posting API history for ${websites.length} websites`);
  let posted = 0;
  for (const website of websites) {
    for (let start = 0; start < DAYS; start += 10) {
      const points = [];
      for (let day = start; day < Math.min(DAYS, start + 10); day += 1) {
        const total = dailyRequests(website.plan.profile, day);
        const errors = Math.round(total * errorShare(website.plan.profile));
        const ok = total - errors;
        const when = dayStart(day);
        ROUTE_WEIGHTS.forEach((weight, route) => {
          const okCount = Math.max(0, Math.round(ok * weight));
          const errorCount = Math.max(0, Math.round(errors * weight));
          if (okCount > 0)
            points.push(
              metricPoint(routePath(route, day), 200, when, okCount, website.plan.profile),
            );
          if (errorCount > 0)
            points.push(
              metricPoint(routePath(route, day), 500, when, errorCount, website.plan.profile),
            );
        });
      }
      await postJson('/v1/metrics', website.token, {
        resourceMetrics: [
          {
            resource: {
              attributes: [
                { key: 'service.name', value: { stringValue: website.name } },
                { key: 'tenant.id', value: { stringValue: website.id } },
              ],
            },
            scopeMetrics: [
              {
                metrics: [
                  {
                    name: 'http.server.duration',
                    unit: 'ms',
                    histogram: { aggregationTemporality: 1, dataPoints: points },
                  },
                ],
              },
            ],
          },
        ],
      });
      posted += 1;
    }

    const spans = [];
    for (let day = 0; day < DAYS; day += 7) {
      const end = dayStart(day);
      const start = new Date(end.getTime() - 40);
      spans.push({
        attributes: [
          { key: 'http.route', value: { stringValue: routePath(0, day) } },
          { key: 'http.response.status_code', value: { intValue: '200' } },
        ],
        startTimeUnixNano: `${start.getTime()}000000`,
        endTimeUnixNano: `${end.getTime()}000000`,
      });
    }
    await postJson('/v1/traces', website.token, {
      resourceSpans: [
        {
          resource: {
            attributes: [
              { key: 'service.name', value: { stringValue: website.name } },
              { key: 'tenant.id', value: { stringValue: website.id } },
            ],
          },
          scopeSpans: [{ spans }],
        },
      ],
    });
  }

  const operatorKey = await createOperatorKey(operatorId, 'Demo metrics');
  const lines = [
    `DEMO_BASE_URL=${base}`,
    'DEMO_TENANT_USERNAME=demo-tenant',
    `DEMO_TENANT_PASSWORD=${tenantPassword}`,
    'DEMO_OTHER_USERNAME=demo-other',
    `DEMO_OTHER_PASSWORD=${otherPassword}`,
    'DEMO_OPERATOR_USERNAME=demo-operator',
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

async function insertWeb(plan: ProjectPlan, websiteId: string) {
  const domain = `demo-${String(plan.index + 1).padStart(2, '0')}.example`;
  const countries = ['US', 'DE', 'NG', 'BR', 'SG', 'JP', 'GB', 'KR'];
  const browsers = ['chrome', 'firefox', 'safari', 'edge'];
  const systems = ['Windows', 'Mac OS', 'Android', 'iOS'];
  const devices = ['desktop', 'mobile', 'tablet'];
  const referrers = ['stellar.org', 'google.com', 'github.com', 'duckduckgo.com', ''];
  const paths = ['/', '/pricing', '/accounts', '/docs', '/blog'];
  const sessions = [];
  const events = [];
  for (let day = 0; day < DAYS; day += 1) {
    const views = dailyPageviews(plan.profile, day);
    const visitors = Math.max(1, Math.round(views * 0.45));
    const baseViews = Math.floor(views / visitors);
    let extra = views - baseViews * visitors;
    for (let visitor = 0; visitor < visitors; visitor += 1) {
      const sessionId = randomUUID();
      const when = dayStart(day);
      when.setUTCHours((visitor * 5) % 24, (visitor * 7) % 60, 0, 0);
      sessions.push({
        id: sessionId,
        websiteId,
        browser: browsers[(day + visitor) % browsers.length],
        os: systems[(day + visitor) % systems.length],
        device: devices[(day + visitor) % devices.length],
        language: 'en-US',
        country: countries[(plan.index + day + visitor) % countries.length],
        createdAt: when,
      });
      const count = baseViews + (extra > 0 ? 1 : 0);
      if (extra > 0) extra -= 1;
      for (let view = 0; view < count; view += 1) {
        const at = new Date(when.getTime() + view * 60_000);
        const referrer = referrers[(day + visitor + view) % referrers.length];
        events.push({
          id: randomUUID(),
          websiteId,
          sessionId,
          visitId: sessionId,
          createdAt: at,
          urlPath: paths[(visitor + view) % paths.length],
          referrerDomain: referrer || null,
          pageTitle: 'Demo',
          eventType: 1,
          hostname: domain,
        });
      }
    }
  }
  for (let offset = 0; offset < sessions.length; offset += 1000) {
    await prisma.client.session.createMany({ data: sessions.slice(offset, offset + 1000) });
  }
  for (let offset = 0; offset < events.length; offset += 1000) {
    await prisma.client.websiteEvent.createMany({ data: events.slice(offset, offset + 1000) });
  }
}

main().catch(async error => {
  console.error(error instanceof Error ? error.message : error);
  await prisma.client.$disconnect().catch(() => undefined);
  process.exit(1);
});
