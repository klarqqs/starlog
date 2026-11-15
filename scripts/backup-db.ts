import 'dotenv/config';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createWriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { deleteExpiredBackups, planBackup } from '../src/stellog/ops-baseline';

const dryRun = process.env.DRY_RUN === '1';
const backupDir = process.env.BACKUP_DIR || 'backups';
const plan = planBackup({
  now: new Date(),
  backupDir,
  dbUser: process.env.POSTGRES_USER || 'umami',
  dbName: process.env.POSTGRES_DB || 'umami',
});

console.log(plan.command.join(' '));
console.log(plan.file);

if (dryRun) process.exit(0);

await mkdir(backupDir, { recursive: true });
const output = createWriteStream(plan.file);
const child = spawn(plan.command[0], plan.command.slice(1), {
  stdio: ['ignore', 'pipe', 'inherit'],
});
if (!child.stdout) process.exit(1);
child.stdout.pipe(output);
const [code] = (await once(child, 'close')) as [number | null];
await once(output, 'finish');
if (code !== 0) process.exit(code ?? 1);

const removed = await deleteExpiredBackups(backupDir, new Date());
if (removed.length > 0) console.log(`Removed ${removed.join(', ')}`);
