import { z } from 'zod';
import { hashPassword } from '@/lib/password';
import { parseRequest } from '@/lib/request';
import { badRequest, json } from '@/lib/response';
import { takeReset } from '@/lib/starlog-accounts';
import { updateUser } from '@/queries/prisma';

export async function POST(request: Request) {
  const schema = z.object({
    token: z.string().min(20).max(200),
    password: z.string().min(8).max(255),
  });
  const { body, error } = await parseRequest(request, schema, { skipAuth: true });
  if (error) return error();

  const userId = await takeReset(body.token);
  if (!userId) return badRequest({ message: 'This link is invalid or expired.' });

  await updateUser(userId, { password: hashPassword(body.password) });
  return json({ message: 'Password updated. Sign in with the new password.' });
}
