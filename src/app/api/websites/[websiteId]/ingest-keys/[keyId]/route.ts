import { parseRequest } from '@/lib/request';
import { notFound, ok, unauthorized } from '@/lib/response';
import { canUpdateWebsite } from '@/permissions';
import { revokeIngestKey } from '@/stellog/ingest-key';

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ websiteId: string; keyId: string }> },
) {
  const { auth, error } = await parseRequest(request);
  if (error) return error();

  const { websiteId, keyId } = await params;
  if (!(await canUpdateWebsite(auth, websiteId))) return unauthorized();

  const count = await revokeIngestKey(websiteId, keyId);
  if (!count) return notFound();
  return ok();
}
