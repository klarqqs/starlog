import 'dotenv/config';
import { spawn } from 'node:child_process';
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  CHECK_INTERVAL_SECONDS,
  evaluateBaseline,
  newestBackupAgeSeconds,
  promText,
} from '../src/stellog/ops-baseline';

const onceOnly = !process.argv.includes('--loop');

do {
  const status = await check();
  console.log(JSON.stringify(status));
  if (onceOnly) process.exit(status.alerts.length === 0 ? 0 : 2);
  await new Promise(resolve => setTimeout(resolve, CHECK_INTERVAL_SECONDS * 1000));
} while (!onceOnly);

async function check() {
  const checkedAt = new Date();
  const heartbeatUp = await heartbeat();
  const databaseUp = await database();
  const names = await backupNames();
  const age = newestBackupAgeSeconds(names, checkedAt);
  const backupPresent = age !== null;
  const backupAgeSeconds = age ?? 0;
  const alerts = evaluateBaseline({ heartbeatUp, databaseUp, backupPresent, backupAgeSeconds });
  const body = promText({ heartbeatUp, databaseUp, backupPresent, backupAgeSeconds, checkedAt });
  const textfile = process.env.OPS_TEXTFILE;
  if (textfile) {
    await mkdir(path.dirname(textfile), { recursive: true });
    await writeFile(textfile, body);
  }
  return { alerts, heartbeatUp, databaseUp, backupPresent, backupAgeSeconds };
}

async function heartbeat() {
  const base = process.env.APP_URL || 'http://127.0.0.1:3000';
  try {
    const response = await fetch(new URL('/api/heartbeat', base), {
      signal: AbortSignal.timeout(5000),
    });
    const body = (await response.json()) as { ok?: boolean };
    return response.ok && body?.ok === true;
  } catch {
    return false;
  }
}

async function database() {
  const url = process.env.DATABASE_URL;
  if (!url) return false;
  try {
    const code = await run('psql', [url, '-v', 'ON_ERROR_STOP=1', '-tAc', 'select 1']);
    if (code === 0) return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') return false;
  }
  try {
    const code = await run('docker', [
      'compose',
      'exec',
      '-T',
      'db',
      'pg_isready',
      '-U',
      process.env.POSTGRES_USER || 'umami',
      '-d',
      process.env.POSTGRES_DB || 'umami',
    ]);
    return code === 0;
  } catch {
    return false;
  }
}

async function backupNames() {
  try {
    return await readdir(process.env.BACKUP_DIR || 'backups');
  } catch {
    return [];
  }
}

function run(command: string, args: string[]) {
  return new Promise<number>((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'ignore' });
    child.once('error', reject);
    child.once('close', code => resolve(code ?? 1));
  });
}
