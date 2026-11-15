import { z } from 'zod';
import { defineOperation } from '@/openapi/operation';
import { badRequestResponse, jsonResponse, unauthorizedResponse } from '@/openapi/schemas';

const mode = z.object({ mode: z.enum(['open', 'approval-required']) }).meta({
  id: 'EnrollmentModeSetting',
});

const getEnrollment = defineOperation({
  method: 'get',
  path: '/api/admin/enrollment',
  audience: 'internal',
  auth: 'bearer',
  operation: {
    operationId: 'getEnrollmentMode',
    summary: 'Read the enrollment mode',
    description:
      'Open creates active projects. Approval-required creates pending projects for anyone who is not an admin.',
    tags: ['Administration'],
    responses: {
      '200': jsonResponse(mode, 'The current enrollment mode.'),
      '401': unauthorizedResponse,
    },
  },
});

const setEnrollment = defineOperation({
  method: 'put',
  path: '/api/admin/enrollment',
  audience: 'internal',
  auth: 'bearer',
  operation: {
    operationId: 'setEnrollmentMode',
    summary: 'Change the enrollment mode',
    description: 'Requires an admin session. An operator key cannot change it.',
    tags: ['Administration'],
    requestBody: {
      required: true,
      content: { 'application/json': { schema: mode } },
    },
    responses: {
      '200': jsonResponse(mode, 'The saved enrollment mode.'),
      '400': badRequestResponse,
      '401': unauthorizedResponse,
    },
  },
});

export const operations = [getEnrollment, setEnrollment] as const;
