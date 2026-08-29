# Compliance checklist

Result of the 2026-08-29 four-area audit (GDPR, Play policy, gambling/consumer
law, IP), with every claim adversarially verified against the code. Status:
**clear to launch** — the items below are the paperwork and form answers that
keep it that way.

## Already handled in the repo

- Privacy page (`deploy/site/index.html`): controller identity, legal bases
  (Art. 6(1)(b)+(f)), Hetzner named as processor, retention, IP-address
  mention, data-subject rights, AZOP complaint link, honest "we do not
  **store** your data" wording, bilingual.
- In-app privacy-policy link in Settings (Play User Data policy requires it
  in-app, not just on the listing).
- Nicknames sanitized server-side (control/zero-width/bidi characters
  stripped) — the one free-text surface shown to strangers.
- Docker log rotation capped (10 MB × 3) on both containers, so "nothing is
  stored" holds for logs too. No Caddy access logging, no server-side
  per-connection logging, no database.
- Coin economy invariants (earned-only, non-redeemable, no stakes) — keep
  these four facts true and gambling law stays entirely out of scope.

## One-time paperwork (do once, ~30 minutes total)

- [ ] **Hetzner DPA (AVV)**: after creating the account, accept the data
      processing agreement at accounts.hetzner.com → Account → DPA. Free,
      self-serve, required by GDPR Art. 28.
- [ ] **One-page processing record (ROPA, Art. 30)** — save this with the DPA:
      *Controller: [full name], Croatia, slavkogrbic25@gmail.com. Activity:
      hosting online card-game matches. Data: self-chosen nickname, avatar id,
      game moves, IP address. Subjects: players. Recipients: Hetzner Online
      GmbH (processor, Germany). Transfers outside EU: none. Retention: match
      duration in memory; container logs ≤ a few days by rotation. Security:
      TLS, firewall (22/80/443 only), no persistence, no database.*

## Play Console answers (at listing time)

- **Data safety form**: nickname/avatar/moves are transmitted but qualify for
  the **ephemeral processing** carve-out (in-memory, only as long as the
  match) → declare the flow inside the form; the public badge honestly shows
  "No data collected". Answer the Data deletion section explicitly: no
  accounts, nothing stored, delete-by-uninstall.
- **Privacy policy URL**: `https://belastih.com`.
- **Account deletion policy**: N/A — the app has no accounts.
- **UGC questionnaire**: answer truthfully — users choose a display name shown
  to 3 other players per match and can send emotes from a fixed 10-item list;
  no free-text chat; content is ephemeral; players can leave a table at any
  time.
- **IARC content rating**: answer **"users interact" = yes** (nicknames +
  emotes with strangers). Answer **no** to every gambling question — nothing
  is wagered, coins cannot be bought or cashed out. Expected rating: low
  (PEGI 3/7 tier with an "interaction" notice).
- **Target audience**: declare **13+** (avoids the Designed-for-Families
  obligations while staying honest about stranger interaction).
- **EU DSA trader declaration**: declare **non-trader** (individual, free app,
  no monetization). Note: adding ANY monetization later flips this to trader,
  which publishes a physical address on the listing.
- **Closed testing**: 12 testers × 14 continuous days is the current gate for
  personal accounts — recruit 15–16 so dropouts don't reset the clock.

## Release gates (before the PRODUCTION build, not the beta)

- [ ] **Sentry — decided: NOT shipping it** unless Play Console's free Android
      vitals (crash rates, devices, native stacks) prove insufficient during
      testing. This keeps the "No data collected" badge true forever. If that
      changes, the full gate below applies:
      **Sentry** (if ever added — currently absent): EU data-residency org
      (de.sentry.io); `sendDefaultPii: false`; accept Sentry's DPA; update the
      Data safety form (Crash logs + Diagnostics, collected, shared with
      service provider — possibly also Device IDs for Sentry's installation
      id); add a bilingual crash-reporting section to the privacy page; ship
      all of that in the SAME release as the SDK. Shipping Sentry while the
      listing says "no data collected" is a real removal trigger.
- [ ] **Open-source notices**: all shipped deps are MIT/BSD/Apache (verified —
      zero copyleft). Before production, either generate a notices screen
      (`npx license-checker-rseidelsohn --production`) or publish
      `belastih.com/licenses` and link it from Settings. Fine to skip for the
      closed track.
- [ ] **Trademark sanity check** (10 min): search "bela", "štih" at dziv.hr
      (Croatian IP office, classes 9/28/41). Audit found no collision; the
      name is generic-descriptive, so risk is low.

## Standing invariants — do not break these without re-auditing

1. Coins can never be bought (no IAP for currency).
2. Coins can never be redeemed or transferred.
3. Nothing of value is staked on a match outcome.
4. No accounts / no server-side storage of player data (until the sign-in
   phase, which re-opens the data-safety and deletion questions by design).
5. No free-text channels between players (nicknames stay the only free text,
   sanitized server-side).
