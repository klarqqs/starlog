import { z } from 'zod';
import { defineOperation } from '@/openapi/operation';
import {
  badRequestResponse,
  jsonResponse,
  notFoundResponse,
  unauthorizedResponse,
} from '@/openapi/schemas';

const walletLogin = defineOperation({
  method: 'post',
  path: '/api/auth/wallet/login',
  audience: 'public',
  auth: 'none',
  operation: {
    operationId: 'loginWithWallet',
    summary: 'Sign in with a linked wallet',
    description:
      'Verifies a signed challenge. The address must already be linked to an email account. An unknown wallet is rejected.',
    tags: ['Authentication'],
    requestBody: {
      required: true,
      content: {
        'application/json': { schema: z.object({ transaction: z.string().max(8192) }) },
      },
    },
    responses: {
      '200': jsonResponse(
        z.object({
          token: z.string(),
          user: z.object({
            id: z.uuid(),
            username: z.string(),
            role: z.string(),
            createdAt: z.string().nullable(),
            isAdmin: z.boolean(),
            passwordChangeRequired: z.boolean(),
            teams: z.array(z.looseObject({ id: z.string(), name: z.string() })),
          }),
        }),
        'A session for the linked account.',
      ),
      '400': badRequestResponse,
      '401': unauthorizedResponse,
      '404': notFoundResponse,
    },
  },
});

export const operations = [walletLogin] as const;
