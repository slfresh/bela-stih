#!/usr/bin/env node
// No MediaSession per sound effect. Without it, a Samsung phone with the Galaxy
// Watch companion installed soft-rebooted about ten minutes into a game — with
// the watch itself switched off: the companion runs on the phone.
//
//   node scripts/patch-expo-audio.mjs          # patch (idempotent) and verify
//   node scripts/patch-expo-audio.mjs --check  # verify only; exit 1 if unpatched
//
// What happens without it (expo-audio 57.0.4; 57.0.5 and 58.0.0 do the same):
// every AudioPlayer builds a media3 MediaSession in its constructor
// (AudioPlayer.kt `mediaSession = buildBasicMediaSession(context, ref)`), used
// for nothing unless lock-screen controls are switched on, which this app never
// does. src/audio.ts preloads 55 players, so system_server held 55 active
// sessions for us, and every sound pushed a playback-state change through each
// one's binder, on Android's main thread. Samsung's watch companion
// (com.samsung.wearable.watch7plugin) registered a new MediaController callback
// on those sessions and never let go: 21,108 controllers after three minutes of
// autoplay, each pinning a JNI global reference in system_server. At 51,200 it
// aborted ("global reference table overflow") and the whole framework restarted.
//
// After the patch a player has no session until setActiveForLockScreen(true)
// hands it the playback service's session, and loses it again when those
// controls are cleared. Playback is untouched: ExoPlayer plays with or without a
// session, and audio focus was never the session's job. ExoPlayer is built with
// handleAudioFocus = false and AudioModule requests focus itself on play().
//
// A second trap: expo-audio ships a prebuilt AAR (local-maven-repo), and
// autolinking links that AAR, not these sources, unless apps/mobile/package.json
// lists expo-audio under expo.autolinking.android.buildFromSource. This script
// refuses to run without that entry, and scripts/build-android.sh checks the
// built dex for the basic session's id string.
//
// Run by apps/mobile's postinstall, by `npm run android` and by
// scripts/build-android.sh, which will not build without it. Any expo-audio
// upgrade must re-check this patch: the script refuses a version it was not
// written against.
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const VERSION = '57.0.4';
const MARKER = '[bela-stih patch]';

const here = dirname(fileURLToPath(import.meta.url));
const appPkgPath = join(here, '../apps/mobile/package.json');
const require = createRequire(appPkgPath);
const pkgJson = require.resolve('expo-audio/package.json');
const root = dirname(pkgJson);
const srcDir = join(root, 'android/src/main/java/expo/modules/audio');
const checkOnly = process.argv.includes('--check');

const fail = (msg) => {
  console.error(`!! patch-expo-audio: ${msg}`);
  process.exit(1);
};

const version = JSON.parse(readFileSync(pkgJson, 'utf8')).version;
if (version !== VERSION) {
  fail(`expo-audio is ${version}, this patch was written against ${VERSION}. ` +
    'Read scripts/patch-expo-audio.mjs, check whether the new version still builds a MediaSession ' +
    'for every player, and update VERSION and the patch together.');
}

const appPkg = JSON.parse(readFileSync(appPkgPath, 'utf8'));
const fromSource = appPkg.expo?.autolinking?.android?.buildFromSource;
if (!Array.isArray(fromSource) || !fromSource.includes('expo-audio')) {
  fail('apps/mobile/package.json does not list "expo-audio" in expo.autolinking.android.buildFromSource. ' +
    'Without it Gradle links the prebuilt AAR from local-maven-repo and this patch does nothing.');
}

// Each hunk: the upstream text, what it becomes, and how often it occurs.
const HUNKS = {
  'AudioPlayer.kt': [
    [
      ['  internal var mediaSession: MediaSession = buildBasicMediaSession(context, ref)'],
      [
        `  // ${MARKER} No MediaSession until lock-screen controls are activated (the service`,
        '  // builds its own). One per player put every pooled sound effect in system_server as an active',
        '  // session, and a watch companion leaked a controller on each until system_server ran out of JNI',
        '  // global references and restarted. See scripts/patch-expo-audio.mjs.',
        '  internal var mediaSession: MediaSession? = null',
      ],
      1,
    ],
    [
      [
        '  internal fun assignBasicMediaSession() {',
        '    mediaSession.release()',
        '    mediaSession = buildBasicMediaSession(context, ref)',
        '  }',
      ],
      [
        '  internal fun assignBasicMediaSession() {',
        `    // ${MARKER} Lock-screen controls cleared: drop the session, build no basic one.`,
        '    mediaSession?.release()',
        '    mediaSession = null',
        '  }',
      ],
      1,
    ],
    [
      ['  override fun releasePlayer() {', '    mediaSession.release()'],
      ['  override fun releasePlayer() {', '    mediaSession?.release()', '    mediaSession = null'],
      1,
    ],
  ],
  'AudioUtils.kt': [
    [
      [
        'import android.content.Context',
        'import android.media.AudioDeviceInfo',
        'import android.os.Bundle',
        'import androidx.media3.exoplayer.ExoPlayer',
        'import androidx.media3.session.MediaSession',
        'import java.io.File',
      ],
      ['import android.media.AudioDeviceInfo', 'import android.os.Bundle', 'import java.io.File'],
      1,
    ],
    [
      [
        'fun buildBasicMediaSession(context: Context, player: ExoPlayer): MediaSession {',
        '  return MediaSession.Builder(context, player)',
        '    .setId("ExpoAudioBasicMediaSession_${player.hashCode()}")',
        '    .build()',
        '}',
      ],
      [
        `// ${MARKER} buildBasicMediaSession removed: expo-audio builds no session per player.`,
        '// See scripts/patch-expo-audio.mjs.',
      ],
      1,
    ],
  ],
  'service/AudioControlsService.kt': [
    [
      ['        player.mediaSession.release()', '        player.mediaSession = session'],
      ['        player.mediaSession?.release()', '        player.mediaSession = session'],
      2,
    ],
  ],
};

const count = (s, needle) => s.split(needle).length - 1;
const state = {};
for (const [name, hunks] of Object.entries(HUNKS)) {
  const file = join(srcDir, name);
  const src = readFileSync(file, 'utf8');
  const eol = src.includes('\r\n') ? '\r\n' : '\n';
  const text = (ls) => ls.join(eol);
  const pairs = hunks.map(([from, to, n]) => ({ from: text(from), to: text(to), n }));
  const done = pairs.every((p) => count(src, p.to) === p.n && count(src, p.from) === 0);
  const clean = pairs.every((p) => count(src, p.from) === p.n && count(src, p.to) === 0);
  state[name] = { file, src, pairs, done, clean };
}

// The invariants the patch exists for, checked on the result, not the recipe.
function verify() {
  const kt = [];
  const walk = (d) => {
    for (const e of readdirSync(d)) {
      const p = join(d, e);
      if (statSync(p).isDirectory()) walk(p);
      else if (p.endsWith('.kt')) kt.push(p);
    }
  };
  walk(srcDir);
  const builders = [];
  for (const p of kt) {
    const s = readFileSync(p, 'utf8');
    if (s.includes('buildBasicMediaSession(')) fail(`${relative(root, p)} still builds a basic MediaSession`);
    for (let i = 0; i < count(s, 'MediaSession.Builder('); i++) builders.push(relative(srcDir, p).replace(/\\/g, '/'));
  }
  // Only the lock-screen service may build a session: setActivePlayerInternal and setPlayerOptions.
  if (builders.length !== 2 || builders.some((b) => b !== 'service/AudioControlsService.kt')) {
    fail(`expected exactly 2 MediaSession.Builder calls, both in the lock-screen service; found: ${builders.join(', ') || 'none'}`);
  }
}

if (Object.values(state).every((s) => s.done)) {
  verify();
  console.log(`   expo-audio ${version}: no MediaSession per player`);
  process.exit(0);
}
if (checkOnly) fail(`${srcDir} is not patched; run node scripts/patch-expo-audio.mjs`);
for (const [name, s] of Object.entries(state)) {
  if (!s.done && !s.clean) {
    fail(`${name} is neither the upstream ${VERSION} text nor fully patched; ` +
      'the upstream code moved or a patch was half applied - re-derive the patch by hand.');
  }
}
for (const s of Object.values(state)) {
  if (s.done) continue;
  let out = s.src;
  for (const p of s.pairs) out = out.split(p.from).join(p.to);
  writeFileSync(s.file, out);
  const after = readFileSync(s.file, 'utf8');
  if (!s.pairs.every((p) => count(after, p.to) === p.n && count(after, p.from) === 0)) fail(`the write to ${s.file} did not take`);
}
verify();
console.log(`   expo-audio ${version}: MediaSession per player removed in ${srcDir}`);
