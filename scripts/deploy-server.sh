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
docker compose up -d --build
docker image prune -f >/dev/null
docker compose ps
REMOTE

echo "== waiting for TLS + health"
for i in $(seq 1 30); do
  if curl -fsS "https://$DOMAIN/health" >/dev/null 2>&1; then break; fi
  sleep 2
done
curl -fsS "https://$DOMAIN/health" && echo "" && echo "== LIVE at https://$DOMAIN"
echo "== verify the transport promise:  SERVER_URL=wss://$DOMAIN npm run smoke"
