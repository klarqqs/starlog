import { z } from 'zod';
import { defineOperation } from '@/openapi/operation';
import {
  badRequestResponse,
  jsonResponse,
  notFoundResponse,
  unauthorizedResponse,
} from '@/openapi/schemas';

const linkWallet = defineOperation({
  method: 'post',
  path: '/api/me/wallets/link',
  audience: 'public',
  auth: 'bearer',
  operation: {
    operationId: 'linkWallet',
    summary: 'Link a wallet to the current account',
    description:
      'Consumes a signed challenge. An account can link up to 5 wallets. The address cannot be linked to a second account.',
    tags: ['Authentication'],
    requestBody: {
      required: true,
      content: {
        'application/json': { schema: z.object({ transaction: z.string().max(8192) }) },
      },
    },
    responses: {
      '200': jsonResponse(z.object({ linked: z.string() }), 'The linked public key.'),
      '400': badRequestResponse,
      '401': unauthorizedResponse,
      '404': notFoundResponse,
    },
  },
});

export const operations = [linkWallet] as const;
