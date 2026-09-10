#!/usr/bin/env bash
# Drive the app on a connected device by on-screen label rather than by pixel
# guessing, which breaks the moment a panel changes the layout.
#
#   source scripts/ui.sh
#   ui_dump                 # refresh the view hierarchy
#   ui_text                 # list every visible label
#   ui_tap "Igraj online"   # tap a label's centre
#   ui_has "Obračun"        # 0 if present
#
# MSYS_NO_PATHCONV stops Git Bash rewriting /sdcard into a Windows path.
export MSYS_NO_PATHCONV=1

ADB="${ADB:-/c/Users/slfresh/AppData/Local/Android/Sdk/platform-tools/adb.exe}"
UI_XML="${UI_XML:-/tmp/bela-ui.xml}"

UI_PKG="${UI_PKG:-com.slfresh.belastih}"

# Refuse to dump anything that is not our app. This is a real phone: a
# notification can pull another app in front at any moment, and a UI dump would
# otherwise scrape somebody's private messages into the log.
ui_focused() {
  "$ADB" shell dumpsys window 2>/dev/null | grep -q "mCurrentFocus.*$UI_PKG"
}

ui_front() {
  ui_focused && return 0
  "$ADB" shell am start -n "$UI_PKG/.MainActivity" >/dev/null 2>&1
  sleep 3
  ui_focused
}

ui_dump() {
  if ! ui_focused; then
    echo "ui_dump: $UI_PKG is not in the foreground; refusing to dump" >&2
    return 1
  fi
  "$ADB" shell rm -f /sdcard/ui.xml >/dev/null 2>&1
  "$ADB" shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1
  "$ADB" shell cat /sdcard/ui.xml > "$UI_XML" 2>/dev/null
  [ -s "$UI_XML" ]
}

ui_text() {
  ui_dump || return 1
  grep -oE 'text="[^"]*"' "$UI_XML" | sed 's/^text="//; s/"$//' | grep -v '^$'
}

ui_has() {
  grep -qF "text=\"$1\"" "$UI_XML"
}

# Centre coordinates of the first node whose text matches exactly.
#
# The XML goes in on stdin and the helper is a relative path: MSYS_NO_PATHCONV is
# needed for the /sdcard argument to adb, but it also stops Git Bash translating
# absolute paths for Windows python, which then looks for the wrong drive root and finds nothing.
UI_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

ui_bounds() {
  # base64 so the label survives Git Bash -> Windows python argv decoding
  local b64
  b64=$(printf '%s' "$1" | base64 -w0 2>/dev/null || printf '%s' "$1" | base64)
  python "$(basename "$UI_DIR")/ui_bounds.py" "$b64" < "$UI_XML"
}

# The full bounds ("x1 y1 x2 y2") of the first node whose text OR
# accessibility label matches exactly.
ui_box() {
  local b64
  b64=$(printf '%s' "$1" | base64 -w0 2>/dev/null || printf '%s' "$1" | base64)
  python "$(basename "$UI_DIR")/ui_bounds.py" --box "$b64" < "$UI_XML"
}

ui_tap() {
  ui_dump || return 1
  local xy
  xy=$(ui_bounds "$1")
  if [ -z "$xy" ]; then
    echo "ui_tap: no node labelled '$1'" >&2
    return 1
  fi
  "$ADB" shell input tap $xy
  return 0
}

ui_shot() {
  "$ADB" exec-out screencap -p > "$1" 2>/dev/null
}
