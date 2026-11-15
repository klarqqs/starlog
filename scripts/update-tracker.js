/* eslint-disable no-console */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';

// public/s/<version>.js is hashed into the tenant snippet. This script must not rewrite it.
const endPoint = process.env.COLLECT_API_ENDPOINT;

if (endPoint) {
  const file = path.resolve(process.cwd(), 'public/script.js');

  if (/(?:^|[/\\])public[/\\]s[/\\]/.test(file)) {
    throw new Error('Refusing to rewrite the pinned tracker.');
  }

  const tracker = fs.readFileSync(file);

  fs.writeFileSync(path.resolve(file), tracker.toString().replace(/\/api\/send/g, endPoint));

  console.log(`Updated tracker endpoint: ${endPoint}.`);
}
