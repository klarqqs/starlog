import { z } from 'zod';
import { createSessionToken } from '@/lib/auth';
import { ROLES } from '@/lib/constants';
import { addTeamBillingStatus } from '@/lib/load';
import { hasDefaultPassword } from '@/lib/password';
import prisma from '@/lib/prisma';
import { parseRequest } from '@/lib/request';
import { json, notFound, unauthorized } from '@/lib/response';
import { authHost, consumeChallenge, walletKeyFromEnv } from '@/lib/starlog-accounts';
import { getAllUserTeams, getUser } from '@/queries/prisma';

export async function POST(request: Request) {
  const schema = z.object({ transaction: z.string().max(8192) });
  const { body, error } = await parseRequest(request, schema, { skipAuth: true });
  if (error) return error();
  if (!walletKeyFromEnv()) return notFound({ message: 'Wallet sign-in is not enabled on this server.' });

  const address = await consumeChallenge(body.transaction, authHost(request));
  if (!address) return unauthorized({ message: 'The wallet signature could not be verified. Try again.' });

  const wallet = await prisma.client.wallet.findUnique({ where: { publicKey: address } });
  if (!wallet) {
    return unauthorized({
      message: 'No account is linked to this wallet. Sign in, then link it in Settings → Wallets.',
    });
  }

  const user = await getUser(wallet.userId, { includePassword: true });
  if (!user?.password) return unauthorized({ message: 'This account cannot sign in with a wallet.' });

  const token = await createSessionToken(user);
  const teams = await addTeamBillingStatus(await getAllUserTeams(user.id));
  return json({
    token,
    user: {
      id: user.id,
      username: user.username,
      role: user.role,
      createdAt: user.createdAt,
      isAdmin: user.role === ROLES.admin,
      passwordChangeRequired: hasDefaultPassword(user),
      teams,
    },
  });
}
