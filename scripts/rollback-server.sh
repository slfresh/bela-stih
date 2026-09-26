#!/usr/bin/env bash
# Put the previous server build back, without rebuilding anything.
#
#   bash scripts/rollback-server.sh root@YOUR.SERVER.IP            # the build before the current one
#   bash scripts/rollback-server.sh root@YOUR.SERVER.IP <tag>      # a named build still on the box
#
# deploy-server.sh tags every image by its commit and keeps the last two, so
# the build that ran before the current one is always there. This swaps the
# tag in .env and recreates the game container from it: about two minutes,
# and like any deploy it drops the matches in play - roll back between games.
# /health then reports the tag it is running.
set -euo pipefail

SERVER=${1:?usage: rollback-server.sh user@host [tag]}
WANT=${2:-}

ssh "$SERVER" "bash -s" <<REMOTE
set -euo pipefail
cd /opt/bela/deploy
NOW=\$(grep '^BELA_TAG=' .env | cut -d= -f2)
TAGS=\$(docker images bela-server --format '{{.Tag}} {{.CreatedAt}}' | sort -k2 -r | awk '{ print \$1 }')
echo "== running: \$NOW; on the box: \$(echo \$TAGS | tr '\n' ' ')"
WANT="$WANT"
if [ -z "\$WANT" ]; then
  WANT=\$(echo "\$TAGS" | grep -v "^\$NOW\$" | head -1 || true)
fi
[ -n "\$WANT" ] || { echo "!! no other build on the box to roll back to"; exit 1; }
echo "\$TAGS" | grep -qx "\$WANT" || { echo "!! no image bela-server:\$WANT on the box"; exit 1; }
sed -i "s/^BELA_TAG=.*/BELA_TAG=\$WANT/" .env
export DOMAIN=\$(grep '^DOMAIN=' .env | cut -d= -f2)
export BELA_TAG=\$WANT
docker compose up -d --no-build bela
echo "== rolled back to \$WANT"
docker compose ps
REMOTE

DOMAIN=$(ssh "$SERVER" "grep '^DOMAIN=' /opt/bela/deploy/.env | cut -d= -f2")
echo "== waiting for health"
for i in $(seq 1 30); do
  if curl -fsS "https://$DOMAIN/health" >/dev/null 2>&1; then break; fi
  sleep 2
done
curl -fsS "https://$DOMAIN/health" && echo ""
