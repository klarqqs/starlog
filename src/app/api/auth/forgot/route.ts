import { z } from 'zod';
import { parseRequest } from '@/lib/request';
import { json } from '@/lib/response';
import { issueReset } from '@/lib/starlog-accounts';
import { getUserByUsername } from '@/queries/prisma';

const NEUTRAL = 'If that account exists, a password reset link is on its way.';

export async function POST(request: Request) {
  const schema = z.object({ username: z.string().max(255) });
  const { body, error } = await parseRequest(request, schema, { skipAuth: true });
  if (error) return error();

  const username = body.username.trim().toLowerCase();
  const user = username ? await getUserByUsername(username) : null;
  if (!user) return json({ message: NEUTRAL });

  const token = await issueReset(user.id);
  const link = `${new URL(request.url).origin}/login/reset?token=${token}`;
  console.log(`[starlog] password reset for ${username}: ${link}`);

  return json({
    message: NEUTRAL,
    ...(process.env.NODE_ENV !== 'production' ? { resetUrl: link } : {}),
  });
}
