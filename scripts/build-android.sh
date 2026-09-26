#!/usr/bin/env bash
# Build the Android release locally — the AAB for the Play track and an APK
# for the phone — and refuse to hand over either if it cannot reach the real
# server.
#
#   bash scripts/build-android.sh            # AAB + APK
#   bash scripts/build-android.sh aab        # AAB only
#
# Why this exists. `eas.json` sets EXPO_PUBLIC_SERVER_URL for cloud builds,
# but these builds are made here with Gradle, which never reads eas.json. Two
# store builds (versionCode 15 and 16) went to the internal track with
# `ws://localhost:2567` baked into the JS bundle: every online mode asked a
# player's phone to dial their own machine. It surfaced only when someone
# opened an online table on a real device.
#
# Two belts, the same pair the web build carries: the client's own fallback is
# the production server in a packaged build (src/net/useNetGame.ts), AND the
# bundle inside the artifact is read back here before it is handed over.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

WHAT="${1:-both}"
export EXPO_PUBLIC_SERVER_URL="${EXPO_PUBLIC_SERVER_URL:-wss://belastih.com}"
SDK_DIR="${ANDROID_SDK_DIR:-C:/Users/slfresh/AppData/Local/Android/Sdk}"

echo "== building Android against $EXPO_PUBLIC_SERVER_URL"

# The reanimated event guard: without it a new hand or a rematch could freeze
# the main thread for seconds and Android offered to close the app (see the
# script). It patches node_modules, so it is checked here, every build.
node scripts/patch-reanimated.mjs
# No MediaSession per sound effect: 55 of them, and Samsung's Galaxy Watch
# companion leaking controllers on each, restarted Android mid-game (see the
# script). It also
# refuses to run unless expo-audio is built from these patched sources.
node scripts/patch-expo-audio.mjs

(cd apps/mobile && npx expo prebuild --platform android --no-install)
# prebuild recreates android/ and deletes local.properties every time.
echo "sdk.dir=$SDK_DIR" > apps/mobile/android/local.properties
# A release is for phones: no x86 or x86_64 code (a quarter of the native
# size, for emulators only). CI's emulator builds a debug APK its own way.
sed -i 's/^reactNativeArchitectures=.*/reactNativeArchitectures=armeabi-v7a,arm64-v8a/' apps/mobile/android/gradle.properties
grep -q '^reactNativeArchitectures=armeabi-v7a,arm64-v8a$' apps/mobile/android/gradle.properties || { echo "!! could not set the release ABIs in gradle.properties"; exit 1; }

TASKS="bundleRelease assembleRelease"
[ "$WHAT" = "aab" ] && TASKS="bundleRelease"
(cd apps/mobile/android && ./gradlew $TASKS)

AAB=apps/mobile/android/app/build/outputs/bundle/release/app-release.aab
APK=apps/mobile/android/app/build/outputs/apk/release/app-release.apk

# The check that would have caught it: read the JS bundle back out of the
# artifact and look at the URLs it actually carries.
check() {
  local artifact="$1" entry="$2"
  [ -f "$artifact" ] || { echo "!! $artifact was not produced"; exit 1; }
  python - "$artifact" "$entry" "$EXPO_PUBLIC_SERVER_URL" <<'PY'
import sys, zipfile
artifact, entry, wanted = sys.argv[1], sys.argv[2], sys.argv[3]
with zipfile.ZipFile(artifact) as z:
    try:
        blob = z.read(entry)
    except KeyError:
        sys.exit(f"!! {artifact} has no {entry} - not shippable")
# Hermes packs its string table with no separators, so a URL is followed
# straight by the next literal: match the exact strings, never a host regex.
if wanted.encode() not in blob:
    sys.exit(f"!! {artifact} does not contain {wanted} - not shippable")
if b"ws://localhost:2567" in blob:
    sys.exit(f"!! {artifact} still carries the development default ws://localhost:2567 - not shippable")
note = " (colyseus.js's own unused default is in there too, as always)" if b"ws://127.0.0.1:2567" in blob else ""
print(f"   {artifact}: carries {wanted}, no development default{note}")
PY
}

# expo-audio must come from the patched sources, not its prebuilt AAR: the id
# of the per-player "basic" MediaSession must be gone from the dex. And its
# lock-screen playback service must not be declared (app.json turns it off):
# nothing here starts it, but a media button could, and it cannot run in the
# foreground without the permissions app.json blocks. The AAB's manifest holds
# names in UTF-8, the APK's binary XML in UTF-16, so both are looked for.
check_audio() {
  local artifact="$1"
  python - "$artifact" <<'PY'
import sys, zipfile
artifact = sys.argv[1]
with zipfile.ZipFile(artifact) as z:
    dex = [z.read(n) for n in z.namelist() if n.endswith('.dex')]
if not any(b'Lexpo/modules/audio/AudioPlayer;' in d for d in dex):
    sys.exit(f"!! {artifact} has no expo-audio AudioPlayer - not shippable")
if any(b'ExpoAudioBasicMediaSession_' in d for d in dex):
    sys.exit(f"!! {artifact} still builds a MediaSession per sound player (prebuilt expo-audio AAR or unpatched source; see scripts/patch-expo-audio.mjs) - not shippable")
with zipfile.ZipFile(artifact) as z:
    # The app's own manifest only: an APK keeps it at the root, an AAB under base/manifest/.
    manifests = [z.read(n) for n in z.namelist() if n in ('AndroidManifest.xml', 'base/manifest/AndroidManifest.xml')]
if not manifests:
    sys.exit(f"!! {artifact} has no AndroidManifest.xml - not shippable")
service = 'AudioControlsService'
if any(service.encode() in m or service.encode('utf-16-le') in m for m in manifests):
    sys.exit(f"!! {artifact} still declares expo-audio's media playback service (app.json: enableBackgroundPlayback false) - not shippable")
# Voice messages (1.5.0) record while a button is held: without the permission
# the first press would fail on every phone, silently.
mic = 'android.permission.RECORD_AUDIO'
if not any(mic.encode() in m or mic.encode('utf-16-le') in m for m in manifests):
    sys.exit(f"!! {artifact} does not ask for {mic} (app.json blockedPermissions?) - voice messages cannot record")
print(f"   {artifact}: expo-audio builds no MediaSession per player, no media service is declared, and the microphone is asked for")
PY
}

# Player reports go to an address the player chooses (apps/mobile/src/report.ts).
# Until it is set, only a test build (ALLOW_UNSET_REPORT_ADDRESS=1) may carry the
# placeholder - and nothing built that way may be uploaded.
check_report() {
  local artifact="$1" entry="$2"
  if python - "$artifact" "$entry" <<'PY'
import sys, zipfile
sys.exit(0 if b'REPORT-ADDRESS-NOT-SET' in zipfile.ZipFile(sys.argv[1]).read(sys.argv[2]) else 1)
PY
  then
    if [ "${ALLOW_UNSET_REPORT_ADDRESS:-}" = 1 ]; then
      echo "   $artifact: TEST BUILD - the report address is still the placeholder; never upload this"
      TEST_BUILD=1
    else
      echo "!! $artifact carries the placeholder report address (apps/mobile/src/report.ts) - not shippable (ALLOW_UNSET_REPORT_ADDRESS=1 for a test build)"
      exit 1
    fi
  fi
}

echo "== reading the bundles back"
check "$AAB" base/assets/index.android.bundle
check_audio "$AAB"
check_report "$AAB" base/assets/index.android.bundle
if [ "$WHAT" != "aab" ]; then
  check "$APK" assets/index.android.bundle
  check_report "$APK" assets/index.android.bundle
  check_audio "$APK"
fi
# Permissions, 16 KB page alignment of every 64-bit library, size budgets.
if [ "$WHAT" != "aab" ]; then python scripts/verify-artifact.py "$AAB" "$APK"; else python scripts/verify-artifact.py "$AAB"; fi

# The Hermes source map for this build, kept by versionCode (outside git: it is
# ~10 MB and useless without the matching bundle). A crash report from a
# player's phone carries bytecode offsets; this is what turns them back into
# file and line. Losing it means a release whose crashes cannot be read.
VERSION_CODE=$(python -c "import json; print(json.load(open('apps/mobile/app.json'))['expo']['android']['versionCode'])")
MAP=apps/mobile/android/app/build/generated/sourcemaps/react/release/index.android.bundle.map
# Keyed by versionCode AND the AAB's own sha1 (the one Play reports), so a test
# build or a rebuild of the same versionCode cannot overwrite the map of the
# artifact that was actually uploaded.
AAB_SHA=$(sha1sum "$AAB" | cut -c1-8)
if [ -f "$MAP" ]; then
  mkdir -p "apps/mobile/sourcemaps/$VERSION_CODE-$AAB_SHA"
  cp "$MAP" "apps/mobile/sourcemaps/$VERSION_CODE-$AAB_SHA/index.android.bundle.map"
  cp "$AAB" "apps/mobile/sourcemaps/$VERSION_CODE-$AAB_SHA/app-release.aab"
  echo "   source map and AAB archived under apps/mobile/sourcemaps/$VERSION_CODE-$AAB_SHA/"
else
  echo "!! no Hermes source map at $MAP - crashes from this build could not be read"
  exit 1
fi

# A test build is moved off the path the submit line names, and that line is
# not printed at all: nothing here may be pasted into an upload by mistake.
if [ "${TEST_BUILD:-}" = 1 ]; then
  TEST_AAB="${AAB%.aab}-TESTBUILD.aab"
  mv "$AAB" "$TEST_AAB"
  echo
  echo "!! TEST BUILD - the report address is still the placeholder."
  echo "   Never upload it. The bundle is at $TEST_AAB, off the submit path."
  [ "$WHAT" != "aab" ] && echo "   apk (for the phone): $APK"
  exit 0
fi

echo "== ok: the release points at $EXPO_PUBLIC_SERVER_URL"
echo "   aab: $AAB"
[ "$WHAT" != "aab" ] && echo "   apk: $APK"
echo
echo "   submit with:  cd apps/mobile && npx eas-cli submit --platform android --profile production --path android/app/build/outputs/bundle/release/app-release.aab --non-interactive"
