import { z } from 'zod';
import { parseRequest } from '@/lib/request';
import { badRequest, json, unauthorized } from '@/lib/response';
import { readLedger } from '@/stellog/ledger';
import { metricsWindow } from '@/stellog/operator-query';
import { websitesForUser } from '@/stellog/project-traffic';

const schema = z.object({
  startAt: z.coerce.number().int(),
  endAt: z.coerce.number().int(),
});

/** Aggregate ledger reports for all properties the signed-in account can view. */
export async function GET(request: Request) {
  const { auth, query, error } = await parseRequest(request, schema);
  if (error) return error();
  if (!auth?.user?.id) return unauthorized();

  const windowError = metricsWindow(query.startAt, query.endAt);
  if (windowError) return badRequest({ message: windowError });

  const isOpOrAdmin =
    auth.user.role === 'operator' || auth.user.role === 'admin' || !!auth.user.isAdmin;
  const websites = await websitesForUser(auth.user.id, isOpOrAdmin);
  const ids = websites.map(w => w.id);

  return json(await readLedger(ids, new Date(query.startAt), new Date(query.endAt)));
}
