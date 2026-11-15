import { z } from 'zod';
import { ROLES } from '@/lib/constants';
import { uuid } from '@/lib/crypto';
import { hashPassword } from '@/lib/password';
import { parseRequest } from '@/lib/request';
import { badRequest, json } from '@/lib/response';
import { createUser, getUserByUsername } from '@/queries/prisma';

export async function POST(request: Request) {
  const schema = z.object({
    username: z.string().min(3).max(255),
    password: z.string().min(8).max(255),
  });
  const { body, error } = await parseRequest(request, schema, { skipAuth: true });
  if (error) return error();

  const username = body.username.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(username)) {
    return badRequest({ message: 'Enter a valid email address.' });
  }
  if (await getUserByUsername(username, { showDeleted: true })) {
    return badRequest({ message: 'That email already has an account.' });
  }

  const user = await createUser({
    id: uuid(),
    username,
    password: hashPassword(body.password),
    role: ROLES.user,
  });
  return json(user);
}
