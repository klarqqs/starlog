import { z } from 'zod';
import { parseRequest } from '@/lib/request';
import { badRequest, json, unauthorized } from '@/lib/response';
import { readMyOverview } from '@/stellog/my-overview';
import { metricsWindow } from '@/stellog/operator-query';

const schema = z.object({
  startAt: z.coerce.number().int(),
  endAt: z.coerce.number().int(),
  unit: z
    .union([z.enum(['minute', 'hour', 'day', 'week', 'month', 'year']), z.literal('')])
    .optional(),
});

/** The signed-in account's sites and APIs for one date range. */
export async function GET(request: Request) {
  const { auth, query, error } = await parseRequest(request, schema);
  if (error) return error();
  if (!auth?.user?.id) return unauthorized();

  const windowError = metricsWindow(query.startAt, query.endAt);
  if (windowError) return badRequest({ message: windowError });

  return json(
    await readMyOverview(
      auth.user.id,
      new Date(query.startAt),
      new Date(query.endAt),
      query.unit || undefined,
      auth.user.role === 'operator',
    ),
  );
}
