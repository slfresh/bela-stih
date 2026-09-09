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

(cd apps/mobile && npx expo prebuild --platform android --no-install)
# prebuild recreates android/ and deletes local.properties every time.
echo "sdk.dir=$SDK_DIR" > apps/mobile/android/local.properties

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

echo "== reading the bundles back"
check "$AAB" base/assets/index.android.bundle
if [ "$WHAT" != "aab" ]; then
  check "$APK" assets/index.android.bundle
fi

echo "== ok: the release points at $EXPO_PUBLIC_SERVER_URL"
echo "   aab: $AAB"
[ "$WHAT" != "aab" ] && echo "   apk: $APK"
echo
echo "   submit with:  cd apps/mobile && npx eas-cli submit --platform android --profile production --path android/app/build/outputs/bundle/release/app-release.aab --non-interactive"
