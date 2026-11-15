import { z } from 'zod';
import prisma from '@/lib/prisma';
import { parseRequest } from '@/lib/request';
import { json, notFound } from '@/lib/response';
import { validAddress } from '@/lib/starlog-accounts';

export async function POST(request: Request) {
  const schema = z.object({ address: z.string() });
  const { auth, body, error } = await parseRequest(request, schema);
  if (error) return error();
  if (!validAddress(body.address)) return notFound({ message: 'That wallet is not linked.' });

  const result = await prisma.client.wallet.deleteMany({
    where: { publicKey: body.address, userId: auth.user.id },
  });
  if (!result.count) return notFound({ message: 'That wallet is not linked.' });
  return json({ unlinked: true });
}
