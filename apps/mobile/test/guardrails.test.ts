import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * The promises that keep this a card game and not a casino, and keep "no
 * data collected" true, pinned where a dependency or a doc edit would break
 * them (docs/compliance-checklist.md, standing invariants).
 */

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, '..', '..', '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

describe('the guardrails', () => {
  it('coins can never be bought: no purchase, billing or ads dependency anywhere', () => {
    const deps = Object.keys({
      ...(JSON.parse(read('apps/mobile/package.json')).dependencies ?? {}),
      ...(JSON.parse(read('apps/mobile/package.json')).devDependencies ?? {}),
      ...(JSON.parse(read('package.json')).dependencies ?? {}),
    });
    for (const d of deps) expect(d, d).not.toMatch(/iap|in-app-purchase|purchases|billing|admob|google-mobile-ads|adsdk|revenuecat|stripe/i);
    // And the published promise stays published.
    expect(read('docs/play-store.md')).toMatch(/never be bought or cashed out/);
    expect(read('docs/compliance-checklist.md')).toMatch(/Coins can never be bought — no in-app purchase of any kind, ever/);
  });

  it('reports nothing by itself: no crash or analytics SDK, the crash screen offers the clipboard instead', () => {
    const deps = Object.keys({
      ...(JSON.parse(read('apps/mobile/package.json')).dependencies ?? {}),
      ...(JSON.parse(read('package.json')).dependencies ?? {}),
    });
    for (const d of deps) expect(d, d).not.toMatch(/sentry|crashlytics|firebase|bugsnag|amplitude|mixpanel|segment|datadog/i);
    const boundary = read('apps/mobile/src/ui/ErrorBoundary.tsx');
    expect(boundary).toMatch(/Clipboard\.setStringAsync\(this\.report\(\)\)/);
    // The report names the build and the phone, never the player.
    expect(boundary).toMatch(/`Bela Štih \$\{this\.props\.version\} · \$\{device\}`/);
    expect(boundary).not.toMatch(/nickname|profile|storage/i);
    expect(read('apps/mobile/App.tsx')).toMatch(/copyLabel=\{lang\.s\.ui\.crashCopy\}\s*copiedLabel=\{lang\.s\.ui\.crashCopied\}\s*version=\{APP_VERSION\}/);
  });

  it('ships arm only, checks its permissions and keeps the source map of every release', () => {
    const build = read('scripts/build-android.sh');
    expect(build).toMatch(/reactNativeArchitectures=armeabi-v7a,arm64-v8a/);
    expect(build).toMatch(/python scripts\/verify-artifact\.py "\$AAB" "\$APK"/);
    expect(build).toMatch(/apps\/mobile\/sourcemaps\/\$VERSION_CODE/);
    expect(read('.gitignore')).toMatch(/^apps\/mobile\/sourcemaps\/$/m);
    const verify = read('scripts/verify-artifact.py');
    for (const p of ['SYSTEM_ALERT_WINDOW', 'CAMERA', 'FOREGROUND_SERVICE_MEDIA_PLAYBACK', 'AD_ID', 'ACCESS_FINE_LOCATION']) expect(verify).toContain(p);
    expect(verify).toMatch(/PAGE_16K = 16 \* 1024/);
  });

  it('is installable on the web, from the same files the app serves', () => {
    const manifest = JSON.parse(read('apps/mobile/public/manifest.webmanifest'));
    expect(manifest.start_url).toBe('/igra/');
    expect(manifest.scope).toBe('/igra/');
    expect(manifest.icons.some((i: { purpose?: string }) => i.purpose === 'maskable')).toBe(true);
    for (const i of manifest.icons) expect(() => readFileSync(join(ROOT, 'apps/mobile/public', i.src))).not.toThrow();
    expect(read('apps/mobile/public/index.html')).toMatch(/<link rel="manifest" href="manifest\.webmanifest" \/>/);
  });
});
