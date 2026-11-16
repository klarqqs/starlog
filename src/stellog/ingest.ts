import { extractSignal, type Observation } from './otlp';

export type IngestSignal = 'metrics' | 'traces' | 'logs';

export type IngestWebsite = { id: string; name: string };

export type IngestKeyScope = {
  teamId: string;
  websites: IngestWebsite[];
};

export type IngestDeps = {
  findKey: (token: string) => Promise<IngestKeyScope | null>;
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
 * tenant.id selects a website id in the team. Without it, service.name must
 * match exactly one website name in the team. Anything else is rejected.
 */
export function placeObservations(
  websites: IngestWebsite[],
  rows: Observation[],
): { ok: true; byWebsite: Map<string, Observation[]> } | { ok: false } {
  const byId = new Map(websites.map(website => [website.id.toLowerCase(), website.id]));
  const byName = new Map<string, string[]>();
  for (const website of websites) {
    const name = website.name.trim().toLowerCase();
    const ids = byName.get(name) ?? [];
    ids.push(website.id);
    byName.set(name, ids);
  }

  const byWebsite = new Map<string, Observation[]>();
  for (const row of rows) {
    let websiteId: string | undefined;
    if (row.tenantId) {
      websiteId = byId.get(row.tenantId.toLowerCase());
      if (!websiteId) return { ok: false };
    } else {
      const matches = byName.get(row.serviceName.trim().toLowerCase()) ?? [];
      if (matches.length !== 1) return { ok: false };
      websiteId = matches[0];
    }
    const group = byWebsite.get(websiteId) ?? [];
    group.push(row);
    byWebsite.set(websiteId, group);
  }

  return { ok: true, byWebsite };
}

/**
 * Authenticate with the team ingest key. A key writes only to websites of its
 * team. An unknown or foreign selector stores nothing.
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

  const allowed = new Set(key.websites.map(website => website.id.toLowerCase()));
  if (extracted.tenantIds.some(tenantId => !allowed.has(tenantId))) {
    return { status: 403, body: { message: 'tenant.id is not a website of this team.' } };
  }

  if (extracted.observations.length > MAX_OBSERVATIONS) {
    return { status: 413, body: { message: 'Too many data points in one request.' } };
  }

  if (extracted.observations.length > 0) {
    const placed = placeObservations(key.websites, extracted.observations);
    if (!placed.ok) {
      return {
        status: 403,
        body: { message: 'The payload does not select a website of this team.' },
      };
    }
    for (const [websiteId, rows] of placed.byWebsite) {
      await deps.insert(websiteId, rows);
    }
  }

  return { status: 200, body: {} };
}
