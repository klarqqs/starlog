import { createHash } from 'node:crypto';

export function integrityHash(bytes: Buffer | Uint8Array) {
  return `sha384-${createHash('sha384').update(bytes).digest('base64')}`;
}
