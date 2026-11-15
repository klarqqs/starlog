import { z } from 'zod';
import { defineOperation } from '@/openapi/operation';
import { badRequestResponse, jsonResponse } from '@/openapi/schemas';

const forgot = defineOperation({
  method: 'post',
  path: '/api/auth/forgot',
  audience: 'public',
  auth: 'none',
  operation: {
    operationId: 'forgotPassword',
    summary: 'Request a password reset',
    description:
      'Always returns the same message. The reset link is written to the server log. The response includes resetUrl only when NODE_ENV is not production. This build does not send email.',
    tags: ['Authentication'],
    requestBody: {
      required: true,
      content: { 'application/json': { schema: z.object({ username: z.string().max(255) }) } },
    },
    responses: {
      '200': jsonResponse(
        z.object({ message: z.string(), resetUrl: z.string().optional() }),
        'The same message whether or not the account exists.',
      ),
      '400': badRequestResponse,
    },
  },
});

export const operations = [forgot] as const;
