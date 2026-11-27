import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The two desktop apps (KD Ops and the Time Tracker) update themselves from OUR OWN storage, never from GitHub (the repository is
 * private, so GitHub refuses people without access and updates then stop without any message). These checks keep it that way:
 * if somebody points an app back at GitHub, or breaks a file name, the tests fail before it ships.
 */
const root = resolve(__dirname, '../../../..');
const read = (p: string) => readFileSync(resolve(root, p), 'utf8');
const pkg = (p: string) => JSON.parse(read(p)) as { version: string; build: { publish: unknown; artifactName?: string; nsis?: { artifactName?: string }; mac?: { artifactName?: string }; dmg?: { artifactName?: string } } };
const FEED_HOST = /^https:\/\/[a-z0-9]{20}\.supabase\.co\/storage\/v1\/object\/public\/desktop-app\/updates\/(office|tracker)$/;

describe.each([['desktop-office', 'office'], ['desktop-agent', 'tracker']])('%s updates from our own feed', (dir, app) => {
  const p = pkg(`${dir}/package.json`);
  const publish = (Array.isArray(p.build.publish) ? p.build.publish[0] : p.build.publish) as { provider: string; url: string };

  it('reads updates from the generic feed on our own storage, not GitHub', () => {
    expect(publish.provider).toBe('generic');
    expect(publish.url).toMatch(FEED_HOST);
    expect(publish.url.endsWith(`/${app}`)).toBe(true);
    expect(JSON.stringify(p.build.publish).toLowerCase()).not.toContain('github');
  });

  it('names every file without spaces (the update address spells the name exactly)', () => {
    const names = [p.build.artifactName, p.build.nsis?.artifactName, p.build.mac?.artifactName, p.build.dmg?.artifactName].filter(Boolean) as string[];
    expect(names.length).toBeGreaterThan(0);
    for (const n of names) expect(n).not.toMatch(/\s/);
    // a default name would be "<product name>-<version>...", which has spaces: every kind that is built must be named
    expect(p.build.artifactName ?? p.build.nsis?.artifactName).toBeTruthy();
  });

  it('has a version number and the same one in its lock file', () => {
    expect(p.version).toMatch(/^\d+\.\d+\.\d+$/);
    const lock = JSON.parse(read(`${dir}/package-lock.json`)) as { version: string };
    expect(lock.version).toBe(p.version);
  });
});

describe('the publishing pipeline', () => {
  it('has the script and it uploads the version files last', () => {
    const s = read('scripts/publish-update-feed.sh');
    expect(s.indexOf('for n in "${PAYLOAD[@]}"; do up')).toBeLessThan(s.indexOf('for y in "${YMLS[@]}"; do up'));
    expect(s).toContain('MISSING');
    expect(s.toLowerCase()).not.toContain('github.com');
  });
  it('every build is mirrored to the feed by itself, and a daily check watches both feeds', () => {
    for (const f of ['mirror-desktop-installers.yml', 'mirror-time-tracker.yml']) {
      const y = read(`.github/workflows/${f}`);
      expect(y).toContain('workflow_run');
      expect(y).toContain('scripts/publish-update-feed.sh');
    }
    expect(existsSync(resolve(root, '.github/workflows/check-desktop-feeds.yml'))).toBe(true);
    const c = read('.github/workflows/check-desktop-feeds.yml');
    expect(c).toContain('schedule');
    expect(c).toContain('check office');
    expect(c).toContain('check tracker');
  });
});
