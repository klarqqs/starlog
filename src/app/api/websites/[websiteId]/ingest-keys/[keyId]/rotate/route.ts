import { parseRequest } from '@/lib/request';
import { json, notFound, unauthorized } from '@/lib/response';
import { canUpdateWebsite } from '@/permissions';
import { rotateIngestKey } from '@/stellog/ingest-key';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ websiteId: string; keyId: string }> },
) {
  const { auth, error } = await parseRequest(request);
  if (error) return error();

  const { websiteId, keyId } = await params;
  if (!(await canUpdateWebsite(auth, websiteId))) return unauthorized();

  const created = await rotateIngestKey(websiteId, keyId);
  if (!created) return notFound();
  return json(created);
}
