import { z } from 'zod';
import { defineOperation } from '@/openapi/operation';
import { jsonResponse, unauthorizedResponse } from '@/openapi/schemas';

const listWallets = defineOperation({
  method: 'get',
  path: '/api/me/wallets',
  audience: 'public',
  auth: 'bearer',
  operation: {
    operationId: 'listMyWallets',
    summary: 'List wallets linked to the current account',
    description: 'Returns public keys only.',
    tags: ['Authentication'],
    responses: {
      '200': jsonResponse(
        z.object({
          wallets: z.array(z.object({ publicKey: z.string(), createdAt: z.string() })),
        }),
        'Linked wallets.',
      ),
      '401': unauthorizedResponse,
    },
  },
});

export const operations = [listWallets] as const;
