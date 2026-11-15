import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export function marketingPage(file: string) {
  const html = readFileSync(join(process.cwd(), 'marketing', file));
  return new Response(html, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'public, max-age=300',
    },
  });
}
