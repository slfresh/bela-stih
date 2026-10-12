import { inflateSync } from 'node:zlib';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * The iOS build, pinned where a config edit would quietly break it: the
 * store refuses an icon with transparency, a dev-client profile without
 * expo-dev-client fails on EAS, a universal link needs the same bundle id on
 * both ends. And the few places the client branches by platform, so a fix
 * for one phone never silently leaves the other (docs/ios-eas.md).
 */

const here = dirname(fileURLToPath(import.meta.url));
const mobile = (p: string) => join(here, '..', p);
const read = (p: string) => readFileSync(mobile(p), 'utf8');
const ROOT = join(here, '..', '..', '..');

const app = JSON.parse(read('app.json')).expo;
const eas = JSON.parse(read('eas.json'));
const pkg = JSON.parse(read('package.json'));

/** The lowest alpha in a non-interlaced 8-bit RGBA PNG, by decoding it. */
function minAlpha(file: string): number {
  const png = readFileSync(file);
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  expect(png.readUInt8(24)).toBe(8); // bit depth
  expect(png.readUInt8(25)).toBe(6); // RGBA
  expect(png.readUInt8(28)).toBe(0); // not interlaced
  const idat: Buffer[] = [];
  for (let pos = 8; pos < png.length; ) {
    const len = png.readUInt32BE(pos);
    const type = png.toString('latin1', pos + 4, pos + 8);
    if (type === 'IDAT') idat.push(png.subarray(pos + 8, pos + 8 + len));
    pos += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const bpp = 4;
  const stride = width * bpp;
  let prev = Buffer.alloc(stride);
  let min = 255;
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = Buffer.from(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)));
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? line[i - bpp] : 0;
      const b = prev[i];
      const c = i >= bpp ? prev[i - bpp] : 0;
      if (filter === 1) line[i] = (line[i] + a) & 255;
      else if (filter === 2) line[i] = (line[i] + b) & 255;
      else if (filter === 3) line[i] = (line[i] + ((a + b) >> 1)) & 255;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        line[i] = (line[i] + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 255;
      }
    }
    for (let i = 3; i < stride; i += bpp) if (line[i] < min) min = line[i];
    prev = line;
  }
  return min;
}

describe('the iOS build', () => {
  it('is the same app as the Android one: one id, one orientation policy, an iPad too', () => {
    expect(app.ios.bundleIdentifier).toBe(app.android.package);
    expect(app.ios.supportsTablet).toBe(true);
    // One `orientation` key serves both platforms; the table lays out both ways.
    expect(app.orientation).toBe('default');
    expect(app.ios.buildNumber).toMatch(/^\d+$/);
  });

  it('ships an opaque icon: the store refuses transparency, and Expo would fill the corners white', () => {
    expect(app.ios.icon).toBe('./assets/ios-icon.png');
    expect(minAlpha(mobile('assets/ios-icon.png'))).toBe(255);
    // The launcher icon keeps its clear rounded corners for Android and the web.
    expect(minAlpha(mobile('assets/icon.png'))).toBe(0);
    expect(readFileSync(join(ROOT, 'scripts/make-icons.mjs'), 'utf8')).toMatch(/render\('ios-icon\.png', markSvg\(\{ size: 1024, square: true \}\)/);
  });

  it('opens invite links on both phones, with the same bundle id on the server', () => {
    expect(app.ios.associatedDomains).toEqual(['applinks:belastih.com']);
    const host = app.android.intentFilters[0].data[0].host;
    expect(host).toBe('belastih.com');
    const aasa = JSON.parse(readFileSync(join(ROOT, 'deploy/site/.well-known/apple-app-site-association'), 'utf8'));
    const detail = aasa.applinks.details[0];
    expect(detail.appID).toMatch(new RegExp(`^[A-Z0-9]+\\.${app.ios.bundleIdentifier.replace(/\\./g, '\\\\.')}$`));
    expect(detail.paths).toEqual(['/join', '/join/*']);
    // Apple fetches it without an extension and insists on JSON.
    expect(readFileSync(join(ROOT, 'deploy/Caddyfile'), 'utf8')).toMatch(
      /@aasa path \/\.well-known\/apple-app-site-association\s*\n\s*header @aasa Content-Type application\/json/,
    );
    expect(readFileSync(join(ROOT, 'deploy/site/join.html'), 'utf8')).toMatch(/'belastih:\/\/join\/' \+ encodeURIComponent\(code\)/);
  });

  it('declares what it does to Apple: no tracking, nothing collected, no encryption of its own', () => {
    expect(app.ios.config.usesNonExemptEncryption).toBe(false);
    expect(app.ios.privacyManifests).toEqual({ NSPrivacyTracking: false, NSPrivacyTrackingDomains: [], NSPrivacyCollectedDataTypes: [] });
    // The microphone text comes from the expo-audio plugin, for both platforms.
    const audio = app.plugins.find((p: unknown) => Array.isArray(p) && p[0] === 'expo-audio');
    expect(audio?.[1]?.microphonePermission).toMatch(/microphone/);
  });
});

describe('the EAS profiles', () => {
  it('development is a dev client, preview is internal, production goes to the store', () => {
    expect(eas.build.development).toMatchObject({ developmentClient: true, distribution: 'internal' });
    expect(eas.build['development-simulator']).toMatchObject({ extends: 'development', ios: { simulator: true } });
    expect(eas.build.preview).toMatchObject({ distribution: 'internal' });
    expect(eas.build.preview.developmentClient).toBeUndefined();
    expect(eas.build['preview-simulator']).toMatchObject({ extends: 'preview', ios: { simulator: true } });
    expect(eas.build.production).toMatchObject({ distribution: 'store', autoIncrement: true, credentialsSource: 'remote' });
    expect(eas.build.production.developmentClient).toBeUndefined();
    expect(eas.cli.appVersionSource).toBe('remote');
  });

  it('every profile dials the real server, the belt scripts/build-android.sh wears too', () => {
    for (const name of ['development', 'preview', 'production']) {
      expect(eas.build[name].env?.EXPO_PUBLIC_SERVER_URL, name).toBe('wss://belastih.com');
    }
  });

  it('a dev-client build has expo-dev-client to build with', () => {
    expect(pkg.dependencies['expo-dev-client']).toMatch(/^~57\./);
    expect(existsSync(join(ROOT, 'node_modules/expo-dev-client/package.json'))).toBe(true);
  });
});

describe('the platform branches', () => {
  it('the hardware back is Android alone; iOS has none and the web has the browser', () => {
    const appTsx = read('App.tsx');
    expect(appTsx).toMatch(/if \(Platform\.OS !== 'android'\) return;\s*\n\s*if \(launch === null && menu === 'home'\) return;/);
    expect(appTsx).toMatch(/useWebBack\(launch === null && menu === 'home'/);
    // And nothing else in the client reaches for it, or for Android's own modules.
    const src = (p: string) => read(join('src', p));
    for (const f of ['HomeScreen.tsx', 'TableScreen.tsx', 'OfflineGame.tsx', 'net/OnlineGame.tsx', 'screens/common.tsx']) {
      expect(src(f), f).not.toMatch(/BackHandler|ToastAndroid|PermissionsAndroid|Vibration\b/);
    }
  });

  it('records voice on iOS as the enums the installed expo-audio spells them', () => {
    const constants = readFileSync(join(ROOT, 'node_modules/expo-audio/build/RecordingConstants.js'), 'utf8');
    const voice = read('src/voice/voice.ts');
    const format = /outputFormat: '([^']+)' as IOSOutputFormat/.exec(voice)?.[1];
    const quality = /audioQuality: (\d+) as AudioQuality/.exec(voice)?.[1];
    expect(constants).toContain(`IOSOutputFormat["MPEG4AAC"] = "${format}"`);
    expect(constants).toContain(`AudioQuality["LOW"] = ${quality}]`);
  });

  it('the screens with a text field keep it clear of the iOS keyboard', () => {
    for (const f of ['src/HomeScreen.tsx', 'src/screens/common.tsx']) {
      expect(read(f), f).toMatch(/keyboardShouldPersistTaps="handled"\s*\n\s*automaticallyAdjustKeyboardInsets/);
    }
  });

  it('every screen root is a safe-area view under the one provider', () => {
    expect(read('App.tsx')).toMatch(/<SafeAreaProvider>/);
    for (const f of ['src/HomeScreen.tsx', 'src/TableScreen.tsx', 'src/DeckGallery.tsx', 'src/net/OnlineGame.tsx', 'src/screens/common.tsx']) {
      expect(read(f), f).toMatch(/from 'react-native-safe-area-context'/);
      expect(read(f), f).toMatch(/<SafeAreaView style=\{\[styles\.safe/);
    }
    expect(read('src/table/useTableMetrics.ts')).toMatch(/useSafeAreaInsets\(\)/);
  });
});
