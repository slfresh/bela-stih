#!/usr/bin/env bash
# Play one deal through to its scoring panel on a connected device.
#
# Cards are SVG and carry no accessibility text, so they are tapped positionally
# — but only ever while the hand is actually on screen. Buttons are always tapped
# by label, and the loop stops the moment the result panel appears, so it can
# never blunder into "next deal" or "leave table".
#
#   bash scripts/play-deal.sh [maxRounds]
#
# Set the app's own Settings > Animacije to "Smanjene" first. On the player's
# turn their disc breathes and pings without end, and uiautomator never sees a
# screen that animates forever as idle ("could not get idle state"), so every
# dump on your own turn fails at full motion. Put it back to "Kao sustav" after.
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

  # The zvanja question: the sweep cannot mark a run of cards, so answer it.
  if ui_has "Nemam"; then
    ui_tap "Nemam" >/dev/null && echo "round $round: no zvanja"
    sleep 1
    continue
  fi

  # Announce zvanja whenever offered — it is the only way they can score.
  if ui_has "zovi zvanja"; then
    ui_tap "zovi zvanja" >/dev/null && echo "round $round: announced zvanja"
    sleep 1
    continue
  fi

  # Bidding: take a contract rather than passing the deal around. A short
  # phone labels the button with the suit alone (its pip says "zovi"), and
  # ui_has reads the dump's text, so try both.
  for suit in "zovi list" "zovi srce" "zovi bundeva" "zovi žir"; do
    for label in "$suit" "${suit#zovi }"; do
      if ui_has "$label"; then
        ui_tap "$label" >/dev/null && echo "round $round: bid $suit"
        sleep 1
        continue 3
      fi
    done
  done

  # Otherwise it is a card decision: sweep the fan. The hand carries its own
  # label ("Tvoje karte"), so the sweep finds the fan wherever the layout has
  # put it — it was anchored on a leave button that moved twice ("Izađi",
  # then "Natrag" in the actions row, now in the top corner).
  box=$(ui_box "Tvoje karte" 2>/dev/null)
  if [ -z "$box" ]; then
    echo "round $round: no hand on screen"
    sleep 1
    continue
  fi
  read -r x1 y1 x2 y2 <<<"$box"
  w=$((x2 - x1)); h=$((y2 - y1))
  # Lifted (playable) cards sit higher, edge cards lower; the cards fill the
  # lower part of the hand's block (its top is the room a lifted card needs).
  for fy in 55 70 85; do
    y=$((y1 + h * fy / 100))
    for i in 0 1 2 3 4 5 6 7 8 9 10; do
      "$ADB" shell input tap $((x1 + w * (5 + i * 9) / 100)) "$y"
    done
  done
  sleep 2
done

echo "gave up after $MAX rounds"
exit 1
