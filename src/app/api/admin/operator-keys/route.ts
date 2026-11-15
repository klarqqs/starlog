import { z } from 'zod';
import { parseRequest } from '@/lib/request';
import { json, unauthorized } from '@/lib/response';
import { requireOperatorAdmin } from '@/stellog/operator-auth';
import { createOperatorKey, listOperatorKeys } from '@/stellog/operator-key';

export async function GET(request: Request) {
  if (!(await requireOperatorAdmin(request))) return unauthorized();
  return json({ keys: await listOperatorKeys() });
}

export async function POST(request: Request) {
  const schema = z.object({
    name: z.string().trim().min(1).max(100),
  });
  const { auth, body, error } = await parseRequest(request, schema);
  if (error) return error();
  if (!auth?.user?.isAdmin) return unauthorized();
  return json(await createOperatorKey(auth.user.id, body.name));
}
