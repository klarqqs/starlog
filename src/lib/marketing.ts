import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export function marketingPage(file: string, bodyStart = '') {
  let html = readFileSync(join(process.cwd(), 'marketing', file), 'utf8');
  if (bodyStart) {
    html = html.replace('<body>', `<body>${bodyStart}`);
  }
  return new Response(html, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'public, max-age=300',
    },
  });
}
