import { gunzipSync } from 'node:zlib';
import { otlpProtobufToJson } from './otlp-protobuf';

export function collectBodyToJson(
  bytes: Uint8Array,
  contentType: string | null,
  contentEncoding: string | null,
  signal: 'metrics' | 'traces' | 'logs',
): { ok: true; json: string } | { ok: false; status: number; message: string } {
  let raw = bytes;
  if (contentEncoding?.toLowerCase().includes('gzip')) {
    try {
      raw = gunzipSync(bytes);
    } catch {
      return { ok: false, status: 400, message: 'Gzip body could not be read.' };
    }
  }

  if (contentType?.toLowerCase().includes('protobuf')) {
    try {
      return { ok: true, json: JSON.stringify(otlpProtobufToJson(signal, raw)) };
    } catch {
      return { ok: false, status: 400, message: 'OTLP protobuf could not be read.' };
    }
  }

  return { ok: true, json: new TextDecoder().decode(raw) };
}
