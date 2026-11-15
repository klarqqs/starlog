import { z } from 'zod';
import { parseRequest } from '@/lib/request';
import { badRequest, json, notFound } from '@/lib/response';
import { authHost, buildChallenge, validAddress, walletKeyFromEnv, PUBLIC_NETWORK } from '@/lib/starlog-accounts';

export async function POST(request: Request) {
  const schema = z.object({ address: z.string() });
  const { body, error } = await parseRequest(request, schema, { skipAuth: true });
  if (error) return error();
  if (!walletKeyFromEnv()) return notFound({ message: 'Wallet sign-in is not enabled on this server.' });
  if (!validAddress(body.address)) return badRequest({ message: 'That is not a valid Stellar address.' });

  return json({
    transaction: buildChallenge(body.address, authHost(request)),
    networkPassphrase: PUBLIC_NETWORK,
  });
}
