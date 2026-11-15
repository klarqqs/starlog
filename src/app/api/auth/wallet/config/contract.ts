import { z } from 'zod';
import { defineOperation } from '@/openapi/operation';
import { jsonResponse } from '@/openapi/schemas';

const walletConfig = defineOperation({
  method: 'get',
  path: '/api/auth/wallet/config',
  audience: 'public',
  auth: 'none',
  operation: {
    operationId: 'getWalletConfig',
    summary: 'Wallet sign-in configuration',
    description:
      'Freighter and xBull can be linked after an email account exists. Wallet-only signup is not offered. enabled is false when STELLAR_AUTH_SECRET is unset.',
    tags: ['Authentication'],
    responses: {
      '200': jsonResponse(
        z.object({
          enabled: z.boolean(),
          networkPassphrase: z.string(),
          wallets: z.array(z.enum(['freighter', 'xbull'])),
        }),
        'Whether wallet linking is configured.',
      ),
    },
  },
});

export const operations = [walletConfig] as const;
