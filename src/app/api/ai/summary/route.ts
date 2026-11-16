import { z } from 'zod';
import { parseRequest } from '@/lib/request';
import { badRequest, json, serverError, unauthorized } from '@/lib/response';
import { canViewWebsite } from '@/permissions';
import { collectSummaryFacts, requestSummary, type SummaryScope } from '@/stellog/ai-summary';
import { canReadOperatorProjects } from '@/stellog/operator-auth';
import { metricsWindow } from '@/stellog/operator-query';

const schema = z.object({
  scope: z.enum(['projects', 'overview', 'apis', 'website']),
  websiteId: z.uuid().optional(),
  startAt: z.number().int(),
  endAt: z.number().int(),
});

/** A signed-in summary of the open Stellog view. The model key stays on the server. */
export async function POST(request: Request) {
  const { auth, body, error } = await parseRequest(request, schema);
  if (error) return error();
  if (!auth?.user?.id) return unauthorized();

  const windowError = metricsWindow(body.startAt, body.endAt);
  if (windowError) return badRequest({ message: windowError });
  if (body.scope === 'projects' && !canReadOperatorProjects(auth.user)) return unauthorized();
  if (body.scope === 'website') {
    if (!body.websiteId || !(await canViewWebsite(auth, body.websiteId))) {
      return body.websiteId ? unauthorized() : badRequest({ message: 'websiteId is required.' });
    }
  }

  try {
    const facts = await collectSummaryFacts(
      body.scope as SummaryScope,
      auth.user.id,
      auth.user.role === 'operator',
      new Date(body.startAt),
      new Date(body.endAt),
      body.websiteId,
    );
    return json(await requestSummary(facts));
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : 'The summary could not be written.';
    return serverError(message);
  }
}
