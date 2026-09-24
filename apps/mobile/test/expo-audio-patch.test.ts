import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * No MediaSession per sound effect (scripts/patch-expo-audio.mjs).
 *
 * expo-audio builds a media3 MediaSession for every AudioPlayer, and the sound
 * bank preloads 55 of them. On a Samsung with the Galaxy Watch companion
 * installed (it runs on the phone, watch on or off), it leaked a controller on
 * those sessions with every sound until
 * system_server ran out of JNI global references and Android restarted, about
 * ten minutes into a game.
 *
 * The patch lives in node_modules and only counts if Gradle compiles it rather
 * than linking expo-audio's prebuilt AAR. An install that skipped the
 * postinstall, an expo-audio upgrade, or a lost buildFromSource entry would
 * silently bring the reboot back. These fail first.
 */

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(here, '../package.json'));
const expoAudio = dirname(require.resolve('expo-audio/package.json'));
const kt = (f: string) => readFileSync(join(expoAudio, 'android/src/main/java/expo/modules/audio', f), 'utf8');
const appPkg = () => JSON.parse(readFileSync(join(here, '../package.json'), 'utf8'));

describe('expo-audio builds no MediaSession per player', () => {
  it('is applied to the installed expo-audio', () => {
    const player = kt('AudioPlayer.kt');
    expect(player).toMatch(/\[bela-stih patch\]/);
    expect(player).toMatch(/internal var mediaSession: MediaSession\? = null/);
    expect(player).not.toMatch(/buildBasicMediaSession\(/);
    const utils = kt('AudioUtils.kt');
    expect(utils).not.toMatch(/buildBasicMediaSession\(/);
    expect(utils).not.toMatch(/ExpoAudioBasicMediaSession_/);
    // Sessions come only from the lock-screen service, which the app never starts.
    const service = kt('service/AudioControlsService.kt');
    expect(service.match(/MediaSession\.Builder\(/g)?.length).toBe(2);
    expect(service.match(/player\.mediaSession\?\.release\(\)/g)?.length).toBe(2);
    expect(service).not.toMatch(/player\.mediaSession\.release\(\)/);
    for (const f of ['AudioPlaylist.kt', 'AudioModule.kt', 'AudioRecorder.kt', 'AudioStream.kt']) {
      expect(kt(f), f).not.toMatch(/MediaSession\.Builder\(|buildBasicMediaSession/);
    }
  });

  it('is compiled from source, not taken from the prebuilt AAR', () => {
    // The AAR is why this entry matters: without it autolinking links the unpatched build.
    expect(existsSync(join(expoAudio, 'local-maven-repo'))).toBe(true);
    expect(appPkg().expo?.autolinking?.android?.buildFromSource ?? []).toContain('expo-audio');
    // And the release build proves it from the artifact itself.
    const build = readFileSync(join(here, '../../../scripts/build-android.sh'), 'utf8');
    expect(build).toMatch(/b'ExpoAudioBasicMediaSession_' in d/);
    expect(build).toMatch(/^check_audio "\$AAB"$/m);
    expect(build).toMatch(/^ {2}check_audio "\$APK"$/m);
  });

  it('is pinned to the expo-audio it was written against', () => {
    // Exact, never a range: an upgrade must be a decision that re-reads the patch.
    expect(appPkg().dependencies['expo-audio']).toBe('57.0.4');
    const script = readFileSync(join(here, '../../../scripts/patch-expo-audio.mjs'), 'utf8');
    expect(script).toMatch(/const VERSION = '57\.0\.4';/);
    expect(JSON.parse(readFileSync(join(expoAudio, 'package.json'), 'utf8')).version).toBe('57.0.4');
  });

  it('declares no media playback service', () => {
    // The config plugin adds AudioControlsService unless told not to; with no
    // session of ours, only a stale media button could still start it.
    const app = JSON.parse(readFileSync(join(here, '../app.json'), 'utf8'));
    const plugins: unknown[] = app.expo.plugins;
    expect(plugins).not.toContain('expo-audio');
    const audio = plugins.find((p) => Array.isArray(p) && p[0] === 'expo-audio') as [string, Record<string, unknown>];
    expect(audio[1].enableBackgroundPlayback).toBe(false);
    // Nothing that would bring the services back: background recording or playback.
    expect(Object.keys(audio[1]).sort()).toEqual(['enableBackgroundPlayback', 'microphonePermission']);
    const build = readFileSync(join(here, '../../../scripts/build-android.sh'), 'utf8');
    expect(build).toMatch(/service = 'AudioControlsService'/);
    expect(build).toMatch(/service\.encode\(\) in m or service\.encode\('utf-16-le'\) in m/);
  });

  it('stays dormant: the app never switches on the lock-screen controls', () => {
    // The playback service's two builders are the only sessions left; they run
    // only for setActiveForLockScreen / updateLockScreenMetadata.
    const src = join(here, '../src');
    const files: string[] = [];
    const walk = (d: string) => {
      for (const e of readdirSync(d)) {
        const p = join(d, e);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.(ts|tsx)$/.test(p)) files.push(p);
      }
    };
    walk(src);
    expect(files.length).toBeGreaterThan(20);
    for (const f of files) expect(readFileSync(f, 'utf8'), f).not.toMatch(/setActiveForLockScreen|updateLockScreenMetadata|clearLockScreenControls/);
  });

  it('runs after every install and before every Android build', () => {
    const pkg = appPkg();
    expect(pkg.scripts.postinstall).toMatch(/(^|&& )node \.\.\/\.\.\/scripts\/patch-expo-audio\.mjs($| &&)/);
    expect(pkg.scripts.android).toMatch(/node \.\.\/\.\.\/scripts\/patch-expo-audio\.mjs && .*expo run:android$/);
    const build = readFileSync(join(here, '../../../scripts/build-android.sh'), 'utf8');
    const patch = build.indexOf('node scripts/patch-expo-audio.mjs');
    expect(patch).toBeGreaterThan(-1);
    expect(build).toMatch(/^set -euo pipefail$/m);
    expect(patch).toBeLessThan(build.indexOf('./gradlew'));
  });
});
