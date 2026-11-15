import { notFound, ok, unauthorized } from '@/lib/response';
import { requireOperatorAdmin } from '@/stellog/operator-auth';
import { revokeOperatorKey } from '@/stellog/operator-key';

export async function DELETE(request: Request, { params }: { params: Promise<{ keyId: string }> }) {
  if (!(await requireOperatorAdmin(request))) return unauthorized();
  const { keyId } = await params;
  if (!(await revokeOperatorKey(keyId))) return notFound();
  return ok();
}
