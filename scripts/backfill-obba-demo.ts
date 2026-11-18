/**
 * Add the steady 90-day demo visits to the live Obba website.
 * Leaves existing visits and the real Stellar ledger alone.
 *
 *   DATABASE_URL=postgres://... ./node_modules/.bin/tsx scripts/backfill-obba-demo.ts
 */
import { randomUUID } from 'node:crypto';
import prisma from '../src/lib/prisma';

const WEBSITE_ID = 'bc75c044-ce23-42f4-a4cb-44e9feee6e71';
const MARKER = 'demo-obba';
const DAYS = 90;
const INDEX = 25;

const countries = ['US', 'DE', 'NG', 'BR', 'SG', 'JP', 'GB', 'KR'];
const browsers = ['chrome', 'firefox', 'safari', 'edge'];
const systems = ['Windows', 'Mac OS', 'Android', 'iOS'];
const devices = ['desktop', 'mobile', 'tablet'];
const referrers = ['stellar.org', 'google.com', 'github.com', 'duckduckgo.com', ''];
const paths = ['/', '/pricing', '/accounts', '/docs', '/blog'];

function dayStart(day: number) {
  const date = new Date();
  date.setUTCHours(12, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() - (DAYS - 1 - day));
  return date;
}

async function main() {
  const website = await prisma.client.website.findUnique({
    where: { id: WEBSITE_ID },
    select: { id: true, name: true, domain: true, kind: true },
  });
  if (!website || website.domain !== 'obba.dayfi.co') {
    throw new Error('Live Obba website was not found.');
  }

  const already = await prisma.client.session.count({
    where: { websiteId: WEBSITE_ID, distinctId: MARKER },
  });
  if (already > 0) {
    console.log(`already present sessions=${already}`);
    return;
  }

  const sessions = [];
  const events = [];
  const now = new Date();

  for (let day = 0; day < DAYS; day += 1) {
    const views = 80;
    const visitors = Math.max(1, Math.round(views * 0.45));
    const baseViews = Math.floor(views / visitors);
    let extra = views - baseViews * visitors;

    for (let visitor = 0; visitor < visitors; visitor += 1) {
      const sessionId = randomUUID();
      const when =
        day === DAYS - 1
          ? new Date(now.getTime() - (20 + ((visitor * 47) % (22 * 60))) * 60_000)
          : (() => {
              const date = dayStart(day);
              date.setUTCHours((visitor * 5) % 24, (visitor * 7) % 60, 0, 0);
              return date;
            })();

      sessions.push({
        id: sessionId,
        websiteId: WEBSITE_ID,
        browser: browsers[(day + visitor) % browsers.length],
        os: systems[(day + visitor) % systems.length],
        device: devices[(day + visitor) % devices.length],
        language: 'en-US',
        country: countries[(INDEX + day + visitor) % countries.length],
        distinctId: MARKER,
        createdAt: when,
      });

      const count = baseViews + (extra > 0 ? 1 : 0);
      if (extra > 0) extra -= 1;
      for (let view = 0; view < count; view += 1) {
        const referrer = referrers[(day + visitor + view) % referrers.length];
        events.push({
          id: randomUUID(),
          websiteId: WEBSITE_ID,
          sessionId,
          visitId: sessionId,
          createdAt: new Date(when.getTime() + view * 30_000),
          urlPath: paths[(visitor + view) % paths.length],
          referrerDomain: referrer || null,
          pageTitle: 'Obba',
          eventType: 1,
          hostname: 'obba.dayfi.co',
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

  const since = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const pageviews = await prisma.client.websiteEvent.count({
    where: { websiteId: WEBSITE_ID, eventType: 1, createdAt: { gte: since } },
  });
  console.log(`inserted sessions=${sessions.length} pageviews=${events.length} last30=${pageviews}`);
}

main()
  .catch(error => {
    console.error(error instanceof Error ? error.message : 'backfill failed');
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.client.$disconnect().catch(() => undefined);
  });
