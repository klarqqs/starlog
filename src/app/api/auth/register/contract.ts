import { z } from 'zod';
import { defineOperation } from '@/openapi/operation';
import { badRequestResponse, jsonResponse } from '@/openapi/schemas';

const register = defineOperation({
  method: 'post',
  path: '/api/auth/register',
  audience: 'public',
  auth: 'none',
  operation: {
    operationId: 'registerAccount',
    summary: 'Create an account',
    description:
      'Creates a user from an email address and a password. The email is stored in the username field. The response does not include the password.',
    tags: ['Authentication'],
    requestBody: {
      required: true,
      content: {
        'application/json': {
          schema: z.object({
            username: z.string().min(3).max(255),
            password: z.string().min(8).max(255),
          }),
        },
      },
    },
    responses: {
      '200': jsonResponse(
        z.object({ id: z.uuid(), username: z.string(), role: z.string() }),
        'The new account.',
      ),
      '400': badRequestResponse,
    },
  },
});

export const operations = [register] as const;
