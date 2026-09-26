#!/usr/bin/env bash
# Put the previous server build back, without rebuilding anything.
#
#   bash scripts/rollback-server.sh root@YOUR.SERVER.IP            # the build before the current one
#   bash scripts/rollback-server.sh root@YOUR.SERVER.IP <tag>      # a named build still on the box
#
# deploy-server.sh tags every image by its commit and keeps this build and the
# one that ran before it (BELA_PREV in .env), so the build to go back to is
# always there. This swaps the tags in .env and recreates the game container:
# about two minutes, and like any deploy it drops the matches in play - roll
# back between games. It ends only when /health reports the tag asked for.
set -euo pipefail

SERVER=${1:?usage: rollback-server.sh user@host [tag]}
WANT=${2:-}

ssh "$SERVER" "bash -s" <<REMOTE
set -euo pipefail
cd /opt/bela/deploy
NOW=\$(grep '^BELA_TAG=' .env | cut -d= -f2)
PREV=\$(grep '^BELA_PREV=' .env 2>/dev/null | cut -d= -f2 || true)
TAGS=\$(docker images bela-server --format '{{.Tag}} {{.CreatedAt}}' | sort -k2 -r | awk '{ print \$1 }')
echo "== running: \$NOW; ran before it: \${PREV:-unknown}; on the box: \$(echo \$TAGS | tr '\n' ' ')"
WANT="$WANT"
if [ -z "\$WANT" ]; then
  # The build that ran before this one; failing a record of it, the newest other image.
  WANT=\$PREV
  if [ -z "\$WANT" ] || ! echo "\$TAGS" | grep -qx "\$WANT"; then WANT=\$(echo "\$TAGS" | grep -v "^\$NOW\$" | head -1 || true); fi
fi
[ -n "\$WANT" ] || { echo "!! no other build on the box to roll back to"; exit 1; }
echo "\$TAGS" | grep -qx "\$WANT" || { echo "!! no image bela-server:\$WANT on the box"; exit 1; }
DOM=\$(grep '^DOMAIN=' .env | cut -d= -f2)
# Remember where we came from, so a second rollback returns to the build just left.
printf 'DOMAIN=%s\nBELA_TAG=%s\nBELA_PREV=%s\n' "\$DOM" "\$WANT" "\$NOW" > .env
export DOMAIN=\$DOM
export BELA_TAG=\$WANT
docker compose up -d --no-build bela
echo "== rolled back to \$WANT"
docker compose ps
REMOTE

DOMAIN=$(ssh "$SERVER" "grep '^DOMAIN=' /opt/bela/deploy/.env | cut -d= -f2")
TAG=$(ssh "$SERVER" "grep '^BELA_TAG=' /opt/bela/deploy/.env | cut -d= -f2")
echo "== waiting for /health to report $TAG"
OK=
for i in $(seq 1 45); do
  H=$(curl -fsS "https://$DOMAIN/health" 2>/dev/null || true)
  case "$H" in *"\"sha\":\"$TAG\""*) OK=1; break;; esac
  sleep 2
done
echo "$H"
[ -n "$OK" ] || { echo "!! /health never reported $TAG"; exit 1; }
echo "== $TAG is live"
