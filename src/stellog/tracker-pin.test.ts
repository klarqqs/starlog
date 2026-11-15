import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { integrityHash } from './tracker-integrity';
import {
  COLLECT_PATH,
  isPinnedTrackerPath,
  TRACKER_FILE,
  TRACKER_INTEGRITY,
  TRACKER_VERSION,
  trackerSrc,
  trackingSnippet,
} from './tracker-pin';
import pin from './tracker-pin.json';

describe('pinned tracker', () => {
  test('hashes known bytes as sha384', () => {
    expect(integrityHash(Buffer.from('stellog'))).toBe(
      'sha384-vU5WkmWrUZtWtcFrMjr7IqXmeg/got96+/koZBvj0OSeRCTL5fnA3mQiee75bUZU',
    );
  });

  test('pins the committed file', () => {
    const bytes = fs.readFileSync(path.resolve(process.cwd(), 'public', TRACKER_FILE));

    expect(pin.version).toBe(TRACKER_VERSION);
    expect(pin.file).toBe(TRACKER_FILE);
    expect(pin.endpoint).toBe(COLLECT_PATH);
    expect(pin.integrity).toBe(integrityHash(bytes));
    expect(TRACKER_INTEGRITY).toBe(pin.integrity);
  });

  test('the snippet names the pinned file and carries SRI', () => {
    const code = trackingSnippet(
      trackerSrc('https://stats.example', '', null),
      TRACKER_INTEGRITY,
      '11111111-1111-1111-1111-111111111111',
    );

    expect(code).toContain('/s/1.js');
    expect(code).toContain(`integrity="${TRACKER_INTEGRITY}"`);
    expect(code).toContain('crossorigin="anonymous"');
    expect(code).not.toContain('script.js');
    expect(code).not.toContain('/api/send');
    expect(code.toLowerCase()).not.toContain('umami');
    expect(code).not.toContain('cloud.umami.is');
  });

  test('a configured filename keeps the same file bytes, and a remote URL is ignored', () => {
    expect(trackerSrc('https://stats.example', '', 'stats/t.js')).toBe(
      'https://stats.example/stats/t.js',
    );
    expect(trackerSrc('https://stats.example', '', 'https://cdn.example/tracker.js')).toBe(
      'https://stats.example/s/1.js',
    );
  });

  test('the pinned build does not fetch a remote tracker', () => {
    const built = fs.readFileSync(path.resolve(process.cwd(), 'public/s/1.js'), 'utf8');
    const config = fs.readFileSync(path.resolve(process.cwd(), 'next.config.ts'), 'utf8');
    const proxy = fs.readFileSync(path.resolve(process.cwd(), 'docker/proxy.ts'), 'utf8');

    expect(built).toContain('/s/e');
    expect(built).toContain('x-stellog-cache');
    expect(built).not.toContain('cloud.umami.is');
    expect(config).not.toContain('cloud.umami.is');
    expect(proxy).not.toContain('cloud.umami.is');
    expect(isPinnedTrackerPath('/app/public/s/1.js')).toBe(true);
    expect(isPinnedTrackerPath('/app/public/script.js')).toBe(false);
  });
});
