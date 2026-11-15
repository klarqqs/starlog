import { z } from 'zod';
import { defineOperation } from '@/openapi/operation';
import { badRequestResponse, jsonResponse } from '@/openapi/schemas';

const reset = defineOperation({
  method: 'post',
  path: '/api/auth/reset',
  audience: 'public',
  auth: 'none',
  operation: {
    operationId: 'resetPassword',
    summary: 'Set a new password',
    description: 'Consumes a reset token from /api/auth/forgot and stores the new password.',
    tags: ['Authentication'],
    requestBody: {
      required: true,
      content: {
        'application/json': {
          schema: z.object({
            token: z.string().min(20).max(200),
            password: z.string().min(8).max(255),
          }),
        },
      },
    },
    responses: {
      '200': jsonResponse(z.object({ message: z.string() }), 'The password was changed.'),
      '400': badRequestResponse,
    },
  },
});

export const operations = [reset] as const;
