import { z } from 'zod';
import { defineOperation } from '@/openapi/operation';
import {
  badRequestResponse,
  jsonResponse,
  notFoundResponse,
  okSchema,
  unauthorizedResponse,
} from '@/openapi/schemas';

const projectPath = z.object({
  type: z.enum(['team', 'website']),
  id: z.uuid(),
});

const removeProject = defineOperation({
  method: 'delete',
  path: '/api/admin/projects/{type}/{id}',
  audience: 'internal',
  auth: 'bearer',
  operation: {
    operationId: 'removeProject',
    summary: 'Remove a project',
    description:
      'Deletes a team and its websites, or a website that has no team. Requires an admin session.',
    tags: ['Administration'],
    requestParams: { path: projectPath },
    responses: {
      '200': jsonResponse(okSchema, 'The project was removed.'),
      '400': badRequestResponse,
      '401': unauthorizedResponse,
      '404': notFoundResponse,
    },
  },
});

export const operations = [removeProject] as const;
