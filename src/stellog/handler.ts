import { collectBodyToJson } from './collect-body';
import { type IngestSignal, ingestOtlp } from './ingest';
import { findActiveIngestKey } from './ingest-key';
import { insertObservations } from './metrics-store';

export async function handleOtlpRequest(request: Request, signal: IngestSignal) {
  const decoded = collectBodyToJson(
    new Uint8Array(await request.arrayBuffer()),
    request.headers.get('content-type'),
    request.headers.get('content-encoding'),
    signal,
  );
  if (!decoded.ok) return Response.json({ message: decoded.message }, { status: decoded.status });

  const result = await ingestOtlp(
    {
      authorization: request.headers.get('authorization'),
      signal,
      contentType: 'application/json',
      bodyText: decoded.json,
    },
    {
      findKey: findActiveIngestKey,
      insert: insertObservations,
    },
  );

  return Response.json(result.body, { status: result.status });
}
