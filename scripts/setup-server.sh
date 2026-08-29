#!/usr/bin/env bash
# One-time provisioning of a fresh Ubuntu VPS (Hetzner CX/CAX, Ubuntu 24.04).
# Installs Docker + compose plugin and closes every port except SSH and the web.
#
#   bash scripts/setup-server.sh root@YOUR.SERVER.IP
set -euo pipefail

SERVER=${1:?usage: setup-server.sh user@host}

ssh "$SERVER" 'bash -s' <<'REMOTE'
set -euo pipefail

if ! command -v docker >/dev/null 2>&1; then
  echo "== installing docker"
  curl -fsSL https://get.docker.com | sh
else
  echo "== docker already installed"
fi

echo "== firewall: allow ssh + http/https only"
apt-get install -y -qq ufw >/dev/null
ufw allow OpenSSH >/dev/null
ufw allow 80/tcp >/dev/null
ufw allow 443/tcp >/dev/null
ufw --force enable >/dev/null
ufw status

mkdir -p /opt/bela
echo "== done — deploy with: bash scripts/deploy-server.sh $USER@$(hostname -I | awk '{print $1}') YOUR.DOMAIN"
REMOTE
