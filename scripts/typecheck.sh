#!/usr/bin/env bash
# The three typechecks, each with the compiler its project pins, and each
# failing on ANY output. A config-only diagnostic (TS5101, TS5103: a
# deprecated option, an unknown one) stops tsc before it checks a single file,
# and for weeks "mobile typecheck clean" was that one line waved through.
# Silence is the only pass.
set -uo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

fail=0
run() {
  local name="$1"; shift
  local out
  out=$("$@" 2>&1)
  local code=$?
  if [ $code -ne 0 ] || [ -n "$out" ]; then
    echo "!! typecheck $name failed (exit $code)"
    echo "$out" | head -40
    fail=1
  else
    echo "ok  typecheck $name"
  fi
}
run root npx tsc --noEmit -p tsconfig.json
run mobile bash -c 'cd apps/mobile && npx tsc --noEmit -p tsconfig.json'
run server bash -c 'cd apps/server && npx tsc --noEmit -p tsconfig.json'
exit $fail
