import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const version = '1';
const file = `s/${version}.js`;
const endpoint = process.env.COLLECT_API_ENDPOINT || '/s/e';
const bytes = fs.readFileSync(path.resolve(process.cwd(), 'public', file));
const integrity = `sha384-${createHash('sha384').update(bytes).digest('base64')}`;
const manifest = {
  version,
  file,
  endpoint,
  integrity,
};

fs.writeFileSync(
  path.resolve(process.cwd(), 'src/stellog/tracker-pin.json'),
  `${JSON.stringify(manifest, null, 2)}\n`,
);

console.log(`Pinned tracker ${file} ${integrity}`);
