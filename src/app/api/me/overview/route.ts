import { z } from 'zod';
import { parseRequest } from '@/lib/request';
import { badRequest, json, unauthorized } from '@/lib/response';
import { readMyOverview } from '@/stellog/my-overview';
import { metricsWindow } from '@/stellog/operator-query';

const schema = z.object({
  startAt: z.coerce.number().int(),
  endAt: z.coerce.number().int(),
  unit: z
    .string()
    .optional()
    .transform(value =>
      value && ['minute', 'hour', 'day', 'week', 'month', 'year'].includes(value)
        ? value
        : undefined,
    ),
});

/** The signed-in account's sites and APIs for one date range. */
export async function GET(request: Request) {
  const { auth, query, error } = await parseRequest(request, schema);
  if (error) return error();
  if (!auth?.user?.id) return unauthorized();

  const windowError = metricsWindow(query.startAt, query.endAt);
  if (windowError) return badRequest({ message: windowError });

  const isOpOrAdmin =
    auth.user.role === 'operator' || auth.user.role === 'admin' || !!auth.user.isAdmin;

  return json(
    await readMyOverview(
      auth.user.id,
      new Date(query.startAt),
      new Date(query.endAt),
      query.unit || undefined,
      isOpOrAdmin,
    ),
  );
}
