import { z } from 'zod';
import { parseRequest } from '@/lib/request';
import { json, notFound, unauthorized } from '@/lib/response';
import { canUpdateWebsite, canViewWebsite } from '@/permissions';
import { createIngestKey, listIngestKeys } from '@/stellog/ingest-key';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ websiteId: string }> },
) {
  const { auth, error } = await parseRequest(request);
  if (error) return error();

  const { websiteId } = await params;
  const canReadKeys =
    auth.user?.role === 'operator' || auth.user?.isOperator === true
      ? await canViewWebsite(auth, websiteId)
      : await canUpdateWebsite(auth, websiteId);
  if (!canReadKeys) return unauthorized();

  return Response.json(await listIngestKeys(websiteId));
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ websiteId: string }> },
) {
  const schema = z.object({
    name: z.string().trim().min(1).max(255),
  });
  const { auth, body, error } = await parseRequest(request, schema);
  if (error) return error();

  const { websiteId } = await params;
  if (!(await canUpdateWebsite(auth, websiteId))) return unauthorized();

  const created = await createIngestKey(websiteId, body.name);
  if (!created) return notFound();
  const { teamId: _teamId, ...secret } = created;
  return json(secret);
}
