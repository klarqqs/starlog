import { z } from 'zod';
import { defineOperation } from '@/openapi/operation';
import { badRequestResponse, jsonResponse, unauthorizedResponse } from '@/openapi/schemas';
import { createdSecretSchema } from '../../../operator/schema';
import { websiteIdPathSchema } from '../../response-schema';

const keyRow = z.object({
  id: z.uuid(),
  name: z.string(),
  keyPrefix: z.string(),
  revokedAt: z.string().nullable(),
  createdAt: z.string(),
  rotatedFromId: z.uuid().nullable(),
});

const listIngestKeys = defineOperation({
  method: 'get',
  path: '/api/websites/{websiteId}/ingest-keys',
  audience: 'public',
  auth: 'bearer',
  operation: {
    operationId: 'listIngestKeys',
    summary: 'List API ingest keys',
    description:
      'Keys for this website’s team. The secret is not returned. A website id is not an ingest credential. tenant.id or service.name selects a website in the team.',
    tags: ['Websites'],
    requestParams: { path: websiteIdPathSchema },
    responses: {
      '200': jsonResponse(z.array(keyRow), 'Ingest keys for the website.'),
      '401': unauthorizedResponse,
    },
  },
});

const createIngestKey = defineOperation({
  method: 'post',
  path: '/api/websites/{websiteId}/ingest-keys',
  audience: 'public',
  auth: 'bearer',
  operation: {
    operationId: 'createIngestKey',
    summary: 'Create an API ingest key',
    description:
      'Creates a team ingest key and returns the stk_ token once. The key writes only to websites of this team. Send it as Authorization: Bearer on POST /v1/metrics, /v1/traces, and /v1/logs.',
    tags: ['Websites'],
    requestParams: { path: websiteIdPathSchema },
    requestBody: {
      required: true,
      content: {
        'application/json': { schema: z.object({ name: z.string().min(1).max(255) }) },
      },
    },
    responses: {
      '200': jsonResponse(createdSecretSchema, 'The new key. Copy the token now.'),
      '400': badRequestResponse,
      '401': unauthorizedResponse,
    },
  },
});

export const operations = [listIngestKeys, createIngestKey] as const;
