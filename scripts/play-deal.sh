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
  # button ("Natrag" offline, "Napusti stol" online — it was "Izađi" until the
  # offline screen took the shared back label, and this anchor went stale
  # without the script noticing: it just reported "no hand on screen").
  # Lifted (playable) cards sit higher, edge cards lower — three rows cover
  # all. The offsets are measured UP from the leave button, and M5 put two
  # rows between it and the fan (the emote strip and the actions row), so the
  # old -70..-230 landed on the emotes and sent a bot a thumbs-up every round.
  base=$(ui_bounds "Natrag" 2>/dev/null | awk '{print $2}')
  [ -z "$base" ] && base=$(ui_bounds "Napusti stol" 2>/dev/null | awk '{print $2}')
  if [ -z "$base" ]; then
    echo "round $round: no hand on screen"
    sleep 1
    continue
  fi
  for dy in -470 -390 -310; do
    # From the fan's left edge: M5 stands the player's own puck to its left.
    for x in 300 374 448 522 596 670 744 818 892 966 1040; do
      "$ADB" shell input tap "$x" $((base + dy))
    done
  done
  sleep 2
done

echo "gave up after $MAX rounds"
exit 1
