import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import {
  BACKUP_MAX_AGE_HOURS,
  backupFileName,
  backupInstant,
  CHECK_STALE_SECONDS,
  deleteExpiredBackups,
  evaluateBaseline,
  expiredBackupNames,
  newestBackupAgeSeconds,
  planBackup,
  planRestore,
  promText,
  renderAlertmanagerConfig,
} from './ops-baseline';

const now = new Date('2026-11-15T21:32:00.000Z');

describe('backup names', () => {
  test('uses a UTC stamp that restore will accept', () => {
    const name = backupFileName(now);

    expect(name).toBe('stellog-20261115T213200Z.dump');
    expect(backupInstant(name)?.toISOString()).toBe(now.toISOString());
    expect(backupInstant('stellog-20261131T000000Z.dump')).toBeNull();
    expect(backupInstant('../stellog-20261115T213200Z.dump')).toBeNull();
  });

  test('drops dumps older than the keep window and ignores other files', () => {
    const oldName = 'stellog-20261001T000000Z.dump';
    const recentName = 'stellog-20261114T000000Z.dump';

    expect(expiredBackupNames([oldName, recentName, 'notes.txt'], now)).toEqual([oldName]);
    expect(newestBackupAgeSeconds([oldName, recentName], now)).toBe(
      Math.floor((now.getTime() - Date.parse('2026-11-14T00:00:00.000Z')) / 1000),
    );
    expect(newestBackupAgeSeconds(['notes.txt'], now)).toBeNull();
  });

  test('deletes only the expired dump in a directory', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'stellog-backup-'));
    await writeFile(path.join(directory, 'stellog-20261001T000000Z.dump'), 'old');
    await writeFile(path.join(directory, 'stellog-20261114T000000Z.dump'), 'new');
    await writeFile(path.join(directory, 'notes.txt'), 'keep');

    expect(await deleteExpiredBackups(directory, now)).toEqual(['stellog-20261001T000000Z.dump']);
  });
});

describe('alerts', () => {
  test('names the failed checks and writes every metric', () => {
    const stale = evaluateBaseline({
      heartbeatUp: false,
      databaseUp: true,
      backupPresent: true,
      backupAgeSeconds: BACKUP_MAX_AGE_HOURS * 3600 + 1,
    });
    const text = promText({
      heartbeatUp: false,
      databaseUp: true,
      backupPresent: false,
      backupAgeSeconds: 0,
      checkedAt: now,
    });

    expect(stale).toEqual(['StellogHeartbeatDown', 'StellogBackupStale']);
    expect(text).toContain('stellog_heartbeat_up 0');
    expect(text).toContain('stellog_database_up 1');
    expect(text).toContain('stellog_backup_present 0');
    expect(text).toContain(`stellog_check_unixtime ${Math.floor(now.getTime() / 1000)}`);
  });

  test('the Prometheus rules use the same names and thresholds', async () => {
    const rules = await import('node:fs').then(fs =>
      fs.readFileSync(path.resolve(process.cwd(), 'infra/monitoring/alerts.yml'), 'utf8'),
    );

    for (const name of [
      'StellogHeartbeatDown',
      'StellogDatabaseDown',
      'StellogBackupMissing',
      'StellogBackupStale',
      'StellogCheckStale',
      'StellogCheckMissing',
    ]) {
      expect(rules).toContain(`alert: ${name}`);
    }
    expect(rules).toContain(String(BACKUP_MAX_AGE_HOURS * 3600));
    expect(rules).toContain(String(CHECK_STALE_SECONDS));
  });
});

describe('restore and alert delivery', () => {
  test('refuses a path escape and a real restore without confirmation', () => {
    expect(
      planRestore({
        name: '../stellog-20261115T213200Z.dump',
        confirm: 'yes',
        dryRun: false,
        fileExists: true,
        dbUser: 'umami',
        dbName: 'umami',
        appService: 'umami',
      }),
    ).toEqual({
      error: 'Restore only a stellog-YYYYMMDDTHHMMSSZ.dump file from the backup directory.',
    });
    expect(
      planRestore({
        name: 'stellog-20261115T213200Z.dump',
        confirm: undefined,
        dryRun: false,
        fileExists: true,
        dbUser: 'umami',
        dbName: 'umami',
        appService: 'umami',
      }).error,
    ).toMatch(/RESTORE_CONFIRM/);
    expect(
      planRestore({
        name: 'stellog-20261115T213200Z.dump',
        confirm: 'yes',
        dryRun: true,
        fileExists: false,
        dbUser: 'umami',
        dbName: 'umami',
        appService: 'umami',
      }).commands?.[0],
    ).toEqual(['docker', 'compose', 'stop', 'umami']);
  });

  test('the dump command does not put the database password on the command line', () => {
    const plan = planBackup({ now, backupDir: 'backups', dbUser: 'umami', dbName: 'umami' });

    expect(plan.file).toBe('backups/stellog-20261115T213200Z.dump');
    expect(plan.command).toContain('--format=custom');
    expect(plan.command.join(' ')).not.toContain('password');
  });

  test('quotes a webhook URL that contains an ampersand', () => {
    const config = renderAlertmanagerConfig('https://hooks.example/alerts?token=a&b=2');

    expect(config).toContain('"https://hooks.example/alerts?token=a&b=2"');
    expect(() => renderAlertmanagerConfig('ftp://hooks.example')).toThrow(/http/);
  });
});
