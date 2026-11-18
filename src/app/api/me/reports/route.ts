import { z } from 'zod';
import { parseRequest } from '@/lib/request';
import { badRequest, json, unauthorized } from '@/lib/response';
import { metricsWindow } from '@/stellog/operator-query';
import { PROJECT_REPORT_SECTIONS } from '@/stellog/project-nav';
import { readProjectReport } from '@/stellog/project-reports';
import { websitesForUser } from '@/stellog/project-traffic';

const schema = z.object({
  section: z.enum(PROJECT_REPORT_SECTIONS),
  startAt: z.coerce.number().int(),
  endAt: z.coerce.number().int(),
});

/** One website report, summed or listed across every project the account can see. */
export async function GET(request: Request) {
  const { auth, query, error } = await parseRequest(request, schema);
  if (error) return error();
  if (!auth?.user?.id) return unauthorized();

  const windowError = metricsWindow(query.startAt, query.endAt);
  if (windowError) return badRequest({ message: windowError });

  const isOpOrAdmin = auth.user.role === 'operator' || auth.user.role === 'admin' || !!auth.user.isAdmin;
  const websites = await websitesForUser(auth.user.id, isOpOrAdmin);
  return json(
    await readProjectReport(
      query.section,
      websites,
      new Date(query.startAt),
      new Date(query.endAt),
    ),
  );
}
