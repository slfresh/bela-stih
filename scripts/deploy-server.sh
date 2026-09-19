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

# Never ship a web bundle that asks players' browsers to dial their own machine.
# This lives here as well as in build-web.sh because deploy-server.sh ships
# whatever is already sitting in deploy/site, and following the deploy docs
# alone would happily re-send a stale pre-fix bundle.
IDX=deploy/site/igra/index.html
if [ -f "$IDX" ]; then
  SERVED=$(grep -o 'index-[0-9a-f]*\.js' "$IDX" | head -1 || true)
  if [ -n "$SERVED" ] && grep -q 'ws://localhost:2567' "deploy/site/igra/_expo/static/js/web/$SERVED"; then
    echo "!! $SERVED points at ws://localhost:2567 -- rebuild with scripts/build-web.sh"
    exit 1
  fi
  # Nor one whose "report a player" goes to the placeholder address.
  if [ -n "$SERVED" ] && grep -q 'REPORT-ADDRESS-NOT-SET' "deploy/site/igra/_expo/static/js/web/$SERVED"; then
    echo "!! $SERVED carries the placeholder report address (apps/mobile/src/report.ts) -- set it and rebuild"
    exit 1
  fi
fi

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
# </dev/null matters: this whole script is being fed to the remote bash on stdin
# (ssh ... "bash -s" <<REMOTE), and compose attaches the caller's stdin to the
# exec. Without it the command eats the next lines of the script, which bash has
# already stopped being able to read -- silently, and with a zero exit code.
if ! docker compose exec -T caddy cat /etc/caddy/Caddyfile </dev/null 2>/dev/null | cmp -s - Caddyfile; then
  echo "== Caddyfile changed; recreating caddy to pick it up"
  docker compose up -d --force-recreate caddy
fi
docker image prune -f >/dev/null
# Every deploy adds a content-hashed bundle and nothing ever removed the old
# ones: they had grown to 24MB of a 27MB site directory. Keep the newest three,
# which still covers a player who loaded the page moments before the deploy and
# whose script request lands just after it.
WEB=/opt/bela/deploy/site/igra/_expo/static/js/web
KEEP=\$(grep -o 'index-[0-9a-f]*\.js' /opt/bela/deploy/site/igra/index.html 2>/dev/null | head -1 || true)
if [ -d "\$WEB" ] && [ -n "\$KEEP" ]; then
  # Keep the bundle index.html actually names, whatever its timestamp, plus the
  # two next newest. Ranking purely by mtime could delete the very file just
  # shipped, and a bare "ls" of an empty match aborts the deploy under pipefail.
  # Every stage needs its own guard: grep exits 1 when it selects NOTHING, and
  # under pipefail that sinks the whole deploy. That is the fresh-box case
  # exactly -- one bundle on disk and it is the one being served -- so the first
  # deploy to a new box reported failure while having actually worked.
  ( ls -1t "\$WEB"/index-*.js 2>/dev/null || true ) | { grep -vF "\$KEEP" || true; } | tail -n +3 | xargs -r rm -f
  echo "== web bundles on disk: \$( ( ls -1 "\$WEB"/index-*.js 2>/dev/null || true ) | wc -l ), serving \$KEEP"
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
