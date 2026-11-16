import 'dotenv/config';
import { describe, expect, test } from 'vitest';
import prisma from '@/lib/prisma';

const databaseUrl = process.env.DATABASE_URL;

(databaseUrl ? describe : describe.skip)('stellog_operator role', () => {
  test('can read rollups and cannot read or write secrets', async () => {
    await asOperator(async tx => {
      await tx.$queryRawUnsafe('SELECT website_id FROM api_metric_hour LIMIT 1');
      await tx.$queryRawUnsafe('SELECT website_id FROM api_metric_day LIMIT 1');
    });

    await expect(
      asOperator(tx =>
        tx.$executeRawUnsafe(
          `INSERT INTO api_metric_hour (website_id, bucket_start, service_name, route, status_code)
           VALUES ('00000000-0000-0000-0000-000000000000', now(), 'api', '/', 200)`,
        ),
      ),
    ).rejects.toThrow(/permission denied/i);

    await expect(
      asOperator(tx => tx.$queryRawUnsafe('SELECT password FROM "user" LIMIT 1')),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      asOperator(tx => tx.$queryRawUnsafe('SELECT distinct_id FROM session LIMIT 1')),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      asOperator(tx => tx.$queryRawUnsafe('SELECT key_hash FROM ingest_key LIMIT 1')),
    ).rejects.toThrow(/permission denied/i);
  });
});

async function asOperator(run: (tx: any) => Promise<unknown>) {
  return prisma.transaction(async (tx: any) => {
    await tx.$executeRawUnsafe('SET LOCAL ROLE stellog_operator');
    return run(tx);
  });
}
