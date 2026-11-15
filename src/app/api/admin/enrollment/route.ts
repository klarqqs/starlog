import { z } from 'zod';
import { parseRequest } from '@/lib/request';
import { json, unauthorized } from '@/lib/response';
import { requireOperatorAdmin } from '@/stellog/operator-auth';
import { getEnrollmentMode, setEnrollmentMode } from '@/stellog/operator-enrollment';

export async function GET(request: Request) {
  if (!(await requireOperatorAdmin(request))) return unauthorized();
  return json({ mode: await getEnrollmentMode() });
}

export async function PUT(request: Request) {
  const schema = z.object({
    mode: z.enum(['open', 'approval-required']),
  });
  const { auth, body, error } = await parseRequest(request, schema);
  if (error) return error();
  if (!auth?.user?.isAdmin) return unauthorized();
  return json({ mode: await setEnrollmentMode(body.mode) });
}
