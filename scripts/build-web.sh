#!/usr/bin/env bash
# Build the web bundle into deploy/site/igra, ready for deploy-server.sh.
#
#   bash scripts/build-web.sh
#
# Two belts, because this went wrong silently twice. The client derives the
# server from the page origin at runtime (see useNetGame.ts), AND the URL is
# baked in here — and the build then REFUSES to hand over a bundle that still
# carries the development default. A web export without the env var used to
# ship `ws://localhost:2567` to production, where nothing surfaced it until a
# real browser tried to open an online game and failed.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

export EXPO_PUBLIC_SERVER_URL="${EXPO_PUBLIC_SERVER_URL:-wss://belastih.com}"
echo "== building web bundle against $EXPO_PUBLIC_SERVER_URL"

(cd apps/mobile && npx expo export --platform web --output-dir ../../deploy/site/igra --clear)

WEB=deploy/site/igra/_expo/static/js/web
BUNDLE=$(ls -1 "$WEB"/index-*.js 2>/dev/null | head -1)
if [ -z "$BUNDLE" ]; then
  echo "!! no bundle produced in $WEB"
  exit 1
fi

# The check that would have caught it. A shipped bundle must not be able to ask
# a player's browser to dial a server on their own machine.
if grep -q 'ws://localhost:2567' "$BUNDLE"; then
  echo "!! $BUNDLE still contains ws://localhost:2567 — not shippable"
  exit 1
fi
if ! grep -q "$EXPO_PUBLIC_SERVER_URL" "$BUNDLE"; then
  echo "!! $BUNDLE does not contain $EXPO_PUBLIC_SERVER_URL — not shippable"
  exit 1
fi

# Player reports go to an address the player chooses (apps/mobile/src/report.ts).
# This writes straight into deploy/site, so there is no test-build override:
# test web exports go to a scratch directory instead.
if grep -q 'REPORT-ADDRESS-NOT-SET' "$BUNDLE"; then
  echo "!! $BUNDLE still carries the placeholder report address (apps/mobile/src/report.ts) — not shippable"
  exit 1
fi

echo "== ok: $(basename "$BUNDLE") points at $EXPO_PUBLIC_SERVER_URL"
