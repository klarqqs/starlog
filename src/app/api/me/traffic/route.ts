import { z } from 'zod';
import { parseRequest } from '@/lib/request';
import { badRequest, json, unauthorized } from '@/lib/response';
import { metricsWindow } from '@/stellog/operator-query';
import { readProjectTraffic, websitesForUser } from '@/stellog/project-traffic';

const schema = z.object({
  startAt: z.coerce.number().int(),
  endAt: z.coerce.number().int(),
  unit: z
    .union([z.enum(['minute', 'hour', 'day', 'week', 'month', 'year']), z.literal('')])
    .optional(),
  timezone: z.string().max(64).optional(),
});

/** Website overview totals for every project the signed-in account can see. */
export async function GET(request: Request) {
  const { auth, query, error } = await parseRequest(request, schema);
  if (error) return error();
  if (!auth?.user?.id) return unauthorized();

  const windowError = metricsWindow(query.startAt, query.endAt);
  if (windowError) return badRequest({ message: windowError });

  const websites = await websitesForUser(auth.user.id, auth.user.role === 'operator');
  return json(
    await readProjectTraffic(
      websites,
      new Date(query.startAt),
      new Date(query.endAt),
      query.unit || undefined,
      query.timezone,
    ),
  );
}
