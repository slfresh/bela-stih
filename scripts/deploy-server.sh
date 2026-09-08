#!/usr/bin/env bash
# Ship the server to the VPS and (re)start the stack.
#
#   bash scripts/deploy-server.sh root@YOUR.SERVER.IP bela.example.com
#
# Copies exactly what the container needs (no git required on the box),
# then builds and restarts remotely. Roughly a minute end to end; running
# matches survive nothing — deploy between games.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

SERVER=${1:?usage: deploy-server.sh user@host domain}
DOMAIN=${2:?usage: deploy-server.sh user@host domain}

echo "== packing"
TAR=$(mktemp -t bela-deploy-XXXX.tgz 2>/dev/null || echo "${TMPDIR:-/tmp}/bela-deploy-$$.tgz")
tar czf "$TAR" \
  package.json package-lock.json tsconfig.json .dockerignore \
  packages/shared-types packages/engine packages/bots packages/table \
  apps/server \
  deploy

echo "== uploading to $SERVER"
scp -q "$TAR" "$SERVER:/opt/bela/deploy.tgz"
rm -f "$TAR"

echo "== building and starting on the box (domain: $DOMAIN)"
ssh "$SERVER" "bash -s" <<REMOTE
set -euo pipefail
cd /opt/bela
tar xzf deploy.tgz && rm deploy.tgz
cd deploy
export DOMAIN=$DOMAIN
# Leave DOMAIN on the box too. Without it a plain "docker compose ps" or "logs"
# in this directory fails on the unset variable -- a trap for anyone debugging
# here later, and a hazard if they reach for "up -d" with an empty domain.
echo "DOMAIN=$DOMAIN" > .env
docker compose up -d --build
# The Caddyfile is bind-mounted as a single FILE, and the upload above replaces
# it rather than writing in place -- so the running container goes on holding
# the old inode and quietly serving the previous config. Nothing reports this:
# compose sees no change, and "caddy reload" reloads the stale file it can see.
# Recreate caddy only when what it has differs from what we just shipped, so an
# unchanged deploy does not drop live websocket connections for nothing.
if ! docker compose exec -T caddy cat /etc/caddy/Caddyfile 2>/dev/null | cmp -s - Caddyfile; then
  echo "== Caddyfile changed; recreating caddy to pick it up"
  docker compose up -d --force-recreate caddy
fi
docker image prune -f >/dev/null
# Every deploy adds a content-hashed bundle and nothing ever removed the old
# ones: they had grown to 24MB of a 27MB site directory. Keep the newest three,
# which still covers a player who loaded the page moments before the deploy and
# whose script request lands just after it.
WEB=/opt/bela/deploy/site/igra/_expo/static/js/web
if [ -d "\$WEB" ]; then
  ls -1t "\$WEB"/index-*.js 2>/dev/null | tail -n +4 | xargs -r rm -f
  echo "== web bundles on disk: \$(ls -1 "\$WEB"/index-*.js 2>/dev/null | wc -l)"
fi
docker compose ps
REMOTE

echo "== waiting for TLS + health"
for i in $(seq 1 30); do
  if curl -fsS "https://$DOMAIN/health" >/dev/null 2>&1; then break; fi
  sleep 2
done
curl -fsS "https://$DOMAIN/health" && echo "" && echo "== LIVE at https://$DOMAIN"
echo "== verify the transport promise:  SERVER_URL=wss://$DOMAIN npm run smoke"
