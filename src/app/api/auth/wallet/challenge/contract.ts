import { z } from 'zod';
import { defineOperation } from '@/openapi/operation';
import { badRequestResponse, jsonResponse, notFoundResponse } from '@/openapi/schemas';

const challenge = defineOperation({
  method: 'post',
  path: '/api/auth/wallet/challenge',
  audience: 'public',
  auth: 'none',
  operation: {
    operationId: 'createWalletChallenge',
    summary: 'Create a wallet challenge',
    description:
      'Returns a Stellar transaction for the address to sign. Returns 404 when wallet sign-in is not configured.',
    tags: ['Authentication'],
    requestBody: {
      required: true,
      content: { 'application/json': { schema: z.object({ address: z.string() }) } },
    },
    responses: {
      '200': jsonResponse(
        z.object({ transaction: z.string(), networkPassphrase: z.string() }),
        'The unsigned challenge.',
      ),
      '400': badRequestResponse,
      '404': notFoundResponse,
    },
  },
});

export const operations = [challenge] as const;
