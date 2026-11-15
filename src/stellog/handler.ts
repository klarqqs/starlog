import { type IngestSignal, ingestOtlp } from './ingest';
import { findActiveIngestKey } from './ingest-key';
import { insertObservations } from './metrics-store';

export async function handleOtlpRequest(request: Request, signal: IngestSignal) {
  const result = await ingestOtlp(
    {
      authorization: request.headers.get('authorization'),
      signal,
      contentType: request.headers.get('content-type'),
      bodyText: await request.text(),
    },
    {
      findKey: findActiveIngestKey,
      insert: insertObservations,
    },
  );

  return Response.json(result.body, { status: result.status });
}
