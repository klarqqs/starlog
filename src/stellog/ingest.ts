import { extractSignal, type Observation } from './otlp';

export type IngestSignal = 'metrics' | 'traces' | 'logs';

export type IngestDeps = {
  findKey: (token: string) => Promise<{ websiteId: string } | null>;
  insert: (websiteId: string, rows: Observation[]) => Promise<void>;
};

const MAX_BODY_BYTES = 1_048_576;
const MAX_OBSERVATIONS = 5000;

export function bearerToken(authorization: string | null): string | null {
  if (!authorization) return null;
  const match = /^Bearer\s+(\S+)\s*$/i.exec(authorization);
  return match?.[1] ?? null;
}

/**
 * Authenticate with the tenant ingest key, derive metrics, and drop the rest.
 * The website id written is always the key's website. A payload that names a
 * different tenant.id is rejected and nothing is stored.
 */
export async function ingestOtlp(
  input: {
    authorization: string | null;
    signal: IngestSignal;
    contentType: string | null;
    bodyText: string;
    now?: Date;
  },
  deps: IngestDeps,
): Promise<{ status: number; body: Record<string, unknown> }> {
  if (input.contentType?.toLowerCase().includes('protobuf')) {
    return { status: 415, body: { message: 'Send OTLP JSON. Protobuf is not accepted.' } };
  }

  const token = bearerToken(input.authorization);
  if (!token) return { status: 401, body: { message: 'Bearer ingest key required.' } };

  const key = await deps.findKey(token);
  if (!key) return { status: 401, body: { message: 'Bearer ingest key required.' } };

  if (Buffer.byteLength(input.bodyText) > MAX_BODY_BYTES) {
    return { status: 413, body: { message: 'Body exceeds 1 MB.' } };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(input.bodyText);
  } catch {
    return { status: 400, body: { message: 'JSON object required.' } };
  }

  const extracted = extractSignal(input.signal, parsed, input.now ?? new Date());
  if ('error' in extracted) return { status: 400, body: { message: extracted.error } };

  const websiteId = key.websiteId.toLowerCase();
  if (extracted.tenantIds.some(tenantId => tenantId !== websiteId)) {
    return { status: 403, body: { message: 'tenant.id does not match this ingest key.' } };
  }

  if (extracted.observations.length > MAX_OBSERVATIONS) {
    return { status: 413, body: { message: 'Too many data points in one request.' } };
  }

  if (extracted.observations.length > 0) {
    await deps.insert(websiteId, extracted.observations);
  }

  return { status: 200, body: {} };
}
