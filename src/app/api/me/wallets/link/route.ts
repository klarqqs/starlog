import { z } from 'zod';
import prisma from '@/lib/prisma';
import { parseRequest } from '@/lib/request';
import { badRequest, json, notFound, unauthorized } from '@/lib/response';
import { authHost, consumeChallenge, walletKeyFromEnv } from '@/lib/starlog-accounts';

export async function POST(request: Request) {
  const schema = z.object({ transaction: z.string().max(8192) });
  const { auth, body, error } = await parseRequest(request, schema);
  if (error) return error();
  if (!walletKeyFromEnv()) return notFound({ message: 'Wallet sign-in is not enabled on this server.' });

  const address = await consumeChallenge(body.transaction, authHost(request));
  if (!address) return unauthorized({ message: 'The wallet signature could not be verified. Try again.' });

  const count = await prisma.client.wallet.count({ where: { userId: auth.user.id } });
  if (count >= 5) return badRequest({ message: 'You can link up to 5 wallets.' });

  try {
    await prisma.client.wallet.create({ data: { publicKey: address, userId: auth.user.id } });
  } catch {
    return badRequest({ message: 'That wallet is already linked to an account.' });
  }
  return json({ linked: address });
}
