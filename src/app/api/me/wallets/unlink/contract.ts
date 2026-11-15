import { z } from 'zod';
import { defineOperation } from '@/openapi/operation';
import {
  badRequestResponse,
  jsonResponse,
  notFoundResponse,
  unauthorizedResponse,
} from '@/openapi/schemas';

const unlinkWallet = defineOperation({
  method: 'post',
  path: '/api/me/wallets/unlink',
  audience: 'public',
  auth: 'bearer',
  operation: {
    operationId: 'unlinkWallet',
    summary: 'Unlink a wallet from the current account',
    description: 'Removes one public key from the signed-in account.',
    tags: ['Authentication'],
    requestBody: {
      required: true,
      content: { 'application/json': { schema: z.object({ address: z.string() }) } },
    },
    responses: {
      '200': jsonResponse(z.object({ unlinked: z.literal(true) }), 'The wallet was unlinked.'),
      '400': badRequestResponse,
      '401': unauthorizedResponse,
      '404': notFoundResponse,
    },
  },
});

export const operations = [unlinkWallet] as const;
