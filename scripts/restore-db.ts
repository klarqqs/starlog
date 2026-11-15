import 'dotenv/config';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createReadStream } from 'node:fs';
import { access } from 'node:fs/promises';
import path from 'node:path';
import { planRestore } from '../src/stellog/ops-baseline.ts';

const name = process.argv[2];
if (!name) {
  console.error('Usage: scripts/restore-db.ts stellog-YYYYMMDDTHHMMSSZ.dump');
  process.exit(2);
}

const backupDir = process.env.BACKUP_DIR || 'backups';
const file = path.join(backupDir, path.basename(name));
let fileExists = false;
try {
  await access(file);
  fileExists = true;
} catch {
  fileExists = false;
}

const plan = planRestore({
  name: path.basename(name),
  confirm: process.env.RESTORE_CONFIRM,
  dryRun: process.env.DRY_RUN === '1',
  fileExists,
  dbUser: process.env.POSTGRES_USER || 'umami',
  dbName: process.env.POSTGRES_DB || 'umami',
  appService: process.env.COMPOSE_APP_SERVICE || 'umami',
});

if ('error' in plan) {
  console.error(plan.error);
  process.exit(2);
}

for (const command of plan.commands) console.log(command.join(' '));
if (process.env.DRY_RUN === '1') process.exit(0);

const [stop, restore, start] = plan.commands;
if ((await run(stop)) !== 0) process.exit(1);
const restoreCode = await run(restore, file);
const startCode = await run(start);
process.exit(restoreCode === 0 && startCode === 0 ? 0 : 1);

async function run(command: string[], stdinFile?: string) {
  const child = spawn(command[0], command.slice(1), {
    stdio: [stdinFile ? 'pipe' : 'ignore', 'inherit', 'inherit'],
  });
  if (stdinFile) {
    if (!child.stdin) return 1;
    createReadStream(stdinFile).pipe(child.stdin);
  }
  const [code] = (await once(child, 'close')) as [number | null];
  return code ?? 1;
}
