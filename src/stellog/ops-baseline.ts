import { readdir, unlink } from 'node:fs/promises';
import path from 'node:path';

/** A daily dump plus two hours. A Stellog choice. */
export const BACKUP_MAX_AGE_HOURS = 26;

/** How many days of dumps to keep. A Stellog choice. */
export const BACKUP_KEEP_DAYS = 14;

/** Page when two check intervals have been missed. A Stellog choice. The check runs every 5 minutes. */
export const CHECK_STALE_SECONDS = 600;

export const CHECK_INTERVAL_SECONDS = 300;

const BACKUP_NAME = /^stellog-(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z\.dump$/;

export function backupFileName(now: Date) {
  const stamp = now
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, 'Z');
  return `stellog-${stamp}.dump`;
}

export function backupInstant(name: string) {
  const match = BACKUP_NAME.exec(name);
  if (!match) return null;
  const [, year, month, day, hour, minute, second] = match;
  const date = new Date(
    Date.UTC(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
      Number(second),
    ),
  );
  if (
    date.getUTCFullYear() !== Number(year) ||
    date.getUTCMonth() !== Number(month) - 1 ||
    date.getUTCDate() !== Number(day)
  ) {
    return null;
  }
  return date;
}

export function expiredBackupNames(names: string[], now: Date, keepDays = BACKUP_KEEP_DAYS) {
  const cutoff = now.getTime() - keepDays * 24 * 60 * 60 * 1000;
  return names.filter(name => {
    const instant = backupInstant(name);
    return instant !== null && instant.getTime() < cutoff;
  });
}

export function newestBackupAgeSeconds(names: string[], now: Date) {
  const times = names
    .map(name => backupInstant(name)?.getTime())
    .filter((time): time is number => time !== undefined);
  if (times.length === 0) return null;
  return Math.max(0, Math.floor((now.getTime() - Math.max(...times)) / 1000));
}

export function evaluateBaseline(input: {
  heartbeatUp: boolean;
  databaseUp: boolean;
  backupPresent: boolean;
  backupAgeSeconds: number;
}) {
  const alerts: string[] = [];
  if (!input.heartbeatUp) alerts.push('StellogHeartbeatDown');
  if (!input.databaseUp) alerts.push('StellogDatabaseDown');
  if (!input.backupPresent) alerts.push('StellogBackupMissing');
  else if (input.backupAgeSeconds > BACKUP_MAX_AGE_HOURS * 3600) alerts.push('StellogBackupStale');
  return alerts;
}

export function promText(input: {
  heartbeatUp: boolean;
  databaseUp: boolean;
  backupPresent: boolean;
  backupAgeSeconds: number;
  checkedAt: Date;
}) {
  const lines = [
    '# HELP stellog_heartbeat_up 1 when GET /api/heartbeat returns {"ok":true}.',
    '# TYPE stellog_heartbeat_up gauge',
    `stellog_heartbeat_up ${input.heartbeatUp ? 1 : 0}`,
    '# HELP stellog_database_up 1 when the database accepts SELECT 1.',
    '# TYPE stellog_database_up gauge',
    `stellog_database_up ${input.databaseUp ? 1 : 0}`,
    '# HELP stellog_backup_present 1 when a stellog dump is on disk.',
    '# TYPE stellog_backup_present gauge',
    `stellog_backup_present ${input.backupPresent ? 1 : 0}`,
    '# HELP stellog_backup_age_seconds Age of the newest dump name. 0 when none exist.',
    '# TYPE stellog_backup_age_seconds gauge',
    `stellog_backup_age_seconds ${input.backupPresent ? input.backupAgeSeconds : 0}`,
    '# HELP stellog_check_unixtime When this check last wrote these metrics.',
    '# TYPE stellog_check_unixtime gauge',
    `stellog_check_unixtime ${Math.floor(input.checkedAt.getTime() / 1000)}`,
    '',
  ];
  return lines.join('\n');
}

export function renderAlertmanagerConfig(url: string) {
  if (!/^https?:\/\//i.test(url) || /[\s"]/.test(url)) {
    throw new Error('ALERT_WEBHOOK_URL must be an http(s) URL without spaces or quotes.');
  }
  return `route:
  receiver: webhook
  group_by: [alertname]
  group_wait: 30s
  group_interval: 5m
  repeat_interval: 1h
receivers:
  - name: webhook
    webhook_configs:
      - url: ${JSON.stringify(url)}
`;
}

export function planBackup(input: {
  now: Date;
  backupDir: string;
  dbUser: string;
  dbName: string;
}) {
  const file = path.join(input.backupDir, backupFileName(input.now));
  return {
    file,
    command: [
      'docker',
      'compose',
      'exec',
      '-T',
      'db',
      'pg_dump',
      '-U',
      input.dbUser,
      '-d',
      input.dbName,
      '--format=custom',
      '--no-owner',
    ],
  };
}

export function planRestore(input: {
  name: string;
  confirm: string | undefined;
  dryRun: boolean;
  fileExists: boolean;
  dbUser: string;
  dbName: string;
  appService: string;
}) {
  if (input.name !== path.basename(input.name) || !backupInstant(input.name)) {
    return {
      error: 'Restore only a stellog-YYYYMMDDTHHMMSSZ.dump file from the backup directory.',
    };
  }
  const commands = [
    ['docker', 'compose', 'stop', input.appService],
    [
      'docker',
      'compose',
      'exec',
      '-T',
      'db',
      'pg_restore',
      '-U',
      input.dbUser,
      '-d',
      input.dbName,
      '--clean',
      '--if-exists',
      '--no-owner',
    ],
    ['docker', 'compose', 'start', input.appService],
  ];
  if (input.dryRun) return { commands };
  if (input.confirm !== 'yes') {
    return { error: 'Set RESTORE_CONFIRM=yes to replace the database.' };
  }
  if (!input.fileExists) return { error: 'Backup file not found.' };
  return { commands };
}

export async function deleteExpiredBackups(
  directory: string,
  now: Date,
  keepDays = BACKUP_KEEP_DAYS,
) {
  const names = await readdir(directory);
  const expired = expiredBackupNames(names, now, keepDays);
  await Promise.all(expired.map(name => unlink(path.join(directory, name))));
  return expired;
}
