import { z } from 'zod';
import { parseRequest } from '@/lib/request';
import { badRequest, json, unauthorized } from '@/lib/response';
import { canViewWebsite } from '@/permissions';
import { readTenantMetrics } from '@/stellog/tenant-metrics';
import { MAX_METRICS_RANGE_MS } from '@/stellog/tenant-report';

const schema = z.object({
  startAt: z.coerce.number().int(),
  endAt: z.coerce.number().int(),
  unit: z
    .union([z.enum(['minute', 'hour', 'day', 'week', 'month', 'year']), z.literal('')])
    .optional(),
});

export async function GET(
  request: Request,
  { params }: { params: Promise<{ websiteId: string }> },
) {
  const { auth, query, error } = await parseRequest(request, schema);
  if (error) return error();

  const { websiteId } = await params;
  if (!(await canViewWebsite(auth, websiteId))) return unauthorized();

  if (query.endAt <= query.startAt) {
    return badRequest({ message: 'endAt must be after startAt.' });
  }
  if (query.endAt - query.startAt > MAX_METRICS_RANGE_MS) {
    return badRequest({ message: 'Date range cannot exceed one year.' });
  }

  return json(
    await readTenantMetrics(
      websiteId,
      new Date(query.startAt),
      new Date(query.endAt),
      query.unit || undefined,
    ),
  );
}
