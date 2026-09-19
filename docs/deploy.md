# Putting the server on the internet

The whole stack is two containers on one small VPS: the Bela game server
(private) behind Caddy (public, automatic HTTPS). One script provisions the
box, one script deploys. Nothing else to install or configure by hand.

## What you need

1. **A Hetzner Cloud VPS** — smallest shared instance (CX22 / CAX11, ~€4/mo),
   image **Ubuntu 24.04**, with your SSH key added. Note its IP.
2. **A domain** (~€10/yr, any registrar). Create one DNS record:
   `A  bela.yourdomain.com  →  YOUR.SERVER.IP`. Wait until
   `ping bela.yourdomain.com` answers from that IP (usually minutes).

## First time: provision the box

```bash
bash scripts/setup-server.sh root@YOUR.SERVER.IP
```

Installs Docker and locks the firewall down to SSH + 80/443.

## Every deploy (first one included)

```bash
bash scripts/deploy-server.sh root@YOUR.SERVER.IP bela.yourdomain.com
```

Packs the server + shared packages, uploads, builds on the box, restarts, and
waits for `https://bela.yourdomain.com/health` to answer. Caddy fetches the
Let's Encrypt certificate automatically on first start — that needs the DNS
record to already resolve. Deploys drop running matches; ship between games.

## Verify like you mean it

```bash
# the four-client hidden-hand leak test, over real TLS:
SERVER_URL=wss://bela.yourdomain.com npm run smoke
# and the emote relay:
cd apps/server && SERVER_URL=wss://bela.yourdomain.com npx tsx src/emote-smoke.ts
# and the gift relay (rate limit, the table gift, a seat keeping its gift
# through a dropped connection and losing it when its player leaves):
SERVER_URL=wss://bela.yourdomain.com npx tsx src/gift-smoke.ts
```

A server that knows gifts must be live BEFORE any app build that sends them:
an older server drops the message silently, and the sender, who pays only on
the server's echo, loses nothing — but sees nothing either.

Then install the app on a phone, turn **Wi-Fi off** (mobile data only), and
play an online match — that is the test that catches everything USB and LAN
were hiding.

## Point the app at production

`apps/mobile/eas.json` → replace both `wss://CHANGE-ME.example.com` values
with `wss://bela.yourdomain.com`. Release builds pick it up via
`EXPO_PUBLIC_SERVER_URL`; local development keeps using `ws://localhost:2567`
(the fallback in `useNetGame.ts`).

## Uptime monitoring

Free [UptimeRobot](https://uptimerobot.com) monitor, type HTTP(S), URL
`https://bela.yourdomain.com/health`, interval 5 min. It emails you when the
box or the container dies.

## The privacy page

`https://bela.yourdomain.com/` serves `deploy/site/index.html` — the bilingual
privacy policy. That URL is what goes into the Play Console listing.

## Invite links (deep linking)

`https://belastih.com/join/CODE` opens the app straight into that table; for
anyone without the app it renders `deploy/site/join.html` (shows the code +
Play Store button). For the links to open the app **directly** on Android 12+,
`deploy/site/.well-known/assetlinks.json` must carry the real signing
fingerprint: at release time, copy the **SHA-256 certificate fingerprint**
from Play Console → Setup → App integrity → App signing, paste it over the
placeholder, and redeploy. Until then the links still work through the landing
page's "Open in app" button (custom-scheme handoff, no verification needed).

## Useful on the box

```bash
ssh root@YOUR.SERVER.IP
cd /opt/bela/deploy
docker compose logs -f bela      # game server logs
docker compose logs -f caddy     # TLS / proxy logs
DOMAIN=... docker compose restart bela
```

## Rules that keep it working

- **Colyseus versions move together**: `@colyseus/core` (server) and
  `colyseus.js` (app + smoke tests) are pinned to **0.16.22 exactly**.
  Upgrade both in the same commit or not at all.
- The server holds no state worth backing up — a dead box is replaced by
  running the two scripts again on a fresh one.
