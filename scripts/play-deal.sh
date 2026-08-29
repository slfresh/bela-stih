#!/usr/bin/env bash
# Play one deal through to its scoring panel on a connected device.
#
# Cards are SVG and carry no accessibility text, so they are tapped positionally
# — but only ever while the hand is actually on screen. Buttons are always tapped
# by label, and the loop stops the moment the result panel appears, so it can
# never blunder into "next deal" or "leave table".
#
#   bash scripts/play-deal.sh [maxRounds]
set -u
cd "$(dirname "${BASH_SOURCE[0]}")/.." || exit 1
source scripts/ui.sh

MAX=${1:-40}
COLS=(118 294 470 646 822)

for round in $(seq 1 "$MAX"); do
  # uiautomator refuses to dump while animations run; wait them out.
  ok=0
  for attempt in 1 2 3 4; do
    if ui_dump >/dev/null; then ok=1; break; fi
    sleep 2
  done
  [ "$ok" = 1 ] || { echo "dump failed"; exit 1; }

  if ui_has "Obračun dijeljenja"; then
    echo "round $round: deal scored"
    exit 0
  fi

  # Announce zvanja whenever offered — it is the only way they can score.
  if ui_has "zovi zvanja"; then
    ui_tap "zovi zvanja" >/dev/null && echo "round $round: announced zvanja"
    sleep 1
    continue
  fi

  # Bidding: take a contract rather than passing the deal around.
  for suit in "zovi list" "zovi srce" "zovi bundeva" "zovi žir"; do
    if ui_has "$suit"; then
      ui_tap "$suit" >/dev/null && echo "round $round: bid $suit"
      sleep 1
      continue 2
    fi
  done

  # Otherwise it is a card decision: sweep the fan, which arcs above the leave
  # button ("Izađi" offline, "Napusti stol" online).
  # Lifted (playable) cards sit higher, edge cards lower — three rows cover all.
  base=$(ui_bounds "Izađi" 2>/dev/null | awk '{print $2}')
  [ -z "$base" ] && base=$(ui_bounds "Napusti stol" 2>/dev/null | awk '{print $2}')
  if [ -z "$base" ]; then
    echo "round $round: no hand on screen"
    sleep 1
    continue
  fi
  for dy in -230 -150 -70; do
    for x in 140 227 314 401 488 575 662 749 836 923 1010; do
      "$ADB" shell input tap "$x" $((base + dy))
    done
  done
  sleep 2
done

echo "gave up after $MAX rounds"
exit 1
