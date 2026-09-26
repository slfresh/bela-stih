#!/usr/bin/env bash
# Collects the device baseline (docs/baselines/) from the Samsung SM-G780G, serial RF8R513DNTP - the one test phone.
# Usage: bash collect.sh <out-dir>   (the app must already be installed; it is launched cold three times)
# No `set -e`: a grep that finds nothing, or a `| head` that closes early, must not end the collection.
set -u
export ANDROID_SERIAL=RF8R513DNTP
PKG=com.slfresh.belastih
OUT=${1:?out dir}
mkdir -p "$OUT"
sh() { adb shell "$@" | tr -d '\r'; }

adb get-state >/dev/null || exit 1
{
  echo "device: $(sh getprop ro.product.model) Android $(sh getprop ro.build.version.release) (API $(sh getprop ro.build.version.sdk)) build $(sh getprop ro.build.display.id)"
  sh dumpsys package "$PKG" | grep -E "versionCode|versionName" | head -2
  echo "display: current $(sh dumpsys display | grep -m1 -oE 'fps=[0-9.]+'), modes: $(sh dumpsys display | grep -oE 'refreshRate=[0-9.]+' | sort -u | tr '\n' ' ')"
} | tee "$OUT/device.txt"

ACT=$(sh cmd package resolve-activity --brief -c android.intent.category.LAUNCHER "$PKG" | tail -n 1)
echo "launcher activity: $ACT" | tee -a "$OUT/device.txt"

# Cold start x3: force-stop, then am start -W (TotalTime = process start to first frame; Android 13 prints no ThisTime).
# gfxinfo is reset before the last start and read 12 s after it, so the frame stats cover the launch and the
# home screen's entrance animation - the home screen is static afterwards and would record no frames at all.
: > "$OUT/cold-start.txt"
for i in 1 2 3; do
  adb shell am force-stop "$PKG"; sleep 3
  if [ "$i" = 3 ]; then adb shell dumpsys gfxinfo "$PKG" reset >/dev/null 2>&1; fi
  sh am start -W -n "$ACT" | grep -E "ThisTime|TotalTime|WaitTime" | sed "s/^/run $i /" | tee -a "$OUT/cold-start.txt"
  sleep 6
done
sleep 6
sh dumpsys gfxinfo "$PKG" > "$OUT/gfxinfo.txt"
grep -E "Total frames rendered|Janky frames|50th percentile|90th percentile|95th percentile|99th percentile|Number Missed Vsync|Number Slow UI|Number Frame deadline" "$OUT/gfxinfo.txt" | head -12 | tee "$OUT/gfxinfo-summary.txt"

# Vibrator: does the motor support composed primitives (R2's haptics depend on it)? Summary, not the history.
sh dumpsys vibrator_manager > "$OUT/vibrator_manager.txt"
grep -oE "mCapabilities=\[[^]]*\]|mSupportedEffects=\[[^]]*\]|mSupportedPrimitives=\[[^]]*\]|mHapticChannelMaxVibrationAmplitude=[0-9.]+|mQFactor=[0-9.]+|mResonantFrequency=[0-9.]+" "$OUT/vibrator_manager.txt" | sort -u | tee "$OUT/vibrator-summary.txt"

# Audio: AudioFlinger tracks (the 40-track cap story) and AAudio MMAP streams (which AudioFlinger does not list).
# The app is still running here (started above), so its players' tracks are what a fresh launch holds.
sh dumpsys media.audio_flinger > "$OUT/audio_flinger.txt"
sh dumpsys media.aaudio > "$OUT/aaudio.txt"
APP_UID=$(sh dumpsys package "$PKG" | grep -m1 -oE "userId=[0-9]+" | cut -d= -f2)
{
  echo "app uid: $APP_UID"
  echo "audio_flinger: $(grep -c "" "$OUT/audio_flinger.txt") lines; track rows naming the app's uid: $(grep -cE "^\s*[0-9]+\s+.*\b$APP_UID\b" "$OUT/audio_flinger.txt")"
  grep -E "^Output thread|tracks|Tracks" "$OUT/audio_flinger.txt" | grep -iE "track" | head -6
  echo "aaudio: $(grep -c "" "$OUT/aaudio.txt") lines; streams: $(grep -ciE "^\s*stream|AAudioServiceStream|MMAP" "$OUT/aaudio.txt")"
  head -n 12 "$OUT/aaudio.txt"
  echo "media sessions: $(sh dumpsys media_session | grep -m1 -oE "have [0-9]+ sessions") (volume-key history lines naming the app do not count)"
} | tee "$OUT/audio-summary.txt"

adb shell am force-stop "$PKG"
echo "done -> $OUT"
