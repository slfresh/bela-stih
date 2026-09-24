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
- Table gifts (1.3.0) keep them true: a gift is a pick from a fixed 15-item
  catalogue (`GIFTS` in `packages/progression`, duplicated as the server's
  `GIFT_IDS` and cross-checked by a test), bought with earned coins at a
  fixed price, nothing random. It spends the SENDER's coins and credits
  nobody — no function adds coins, XP or items to a receiver (pinned in
  `progression.test.ts` and `apps/mobile/test/gift-catalogue.test.ts`). The server only relays `{from, to, id}` with a
  7 s gap per connection, stores nothing, and forwards no text.
- Play's User Generated Content policy (1.3.1): at an online table any other
  player can be HIDDEN (device-local, for that table: name, emotes and
  gifts) or REPORTED (the player's own e-mail with the nickname, table code,
  time and version - nothing sent to the game server). The rules of conduct
  are stated and linked (belastih.com/#pravila) under the nickname field,
  the only place user content is created. Reported nicknames are acted on
  through the server's name filter (apps/server/src/names.ts).
- Voice messages (1.5.0): push-to-talk clips, at most 15 s, recorded only
  while the player holds the mic button - or, from 1.5.1 and only if chosen in
  Settings, between two taps on it, with a cross to throw a take away
  (RECORD_AUDIO, asked for at the first press). The server relays each clip to the other players at that table
  whose apps play voice, and drops it: nothing stores, decodes or logs audio
  (apps/server/src/voice.ts, BelaRoom's 'voice' branch; pinned by
  voice-server.test.ts and voice-smoke.ts). Receivers play it from a cache
  file / Blob URL deleted when it ends. On at every table; a private table's
  host can switch it off; every player can switch it off in Settings, mute
  one player, or hide them (which silences them too). Reports cannot carry
  audio - the reporter describes what was said.
  Receipts (1.5.1): a listener's app says when a clip has started playing
  ('heard'), and the room tells the speaker which seat - believed only from a
  seat the clip went to, once, held in memory for a minute
  (apps/server/src/voice.ts VoiceLedger), never stored or logged. It is the
  fact of a play inside a match (App interactions, already declared as
  processed ephemerally): no Data safety or IARC change; the privacy page says
  so in one clause.

## One-time paperwork (do once, ~30 minutes total)

- [ ] **Hetzner DPA (AVV)**: after creating the account, accept the data
      processing agreement at accounts.hetzner.com → Account → DPA. Free,
      self-serve, required by GDPR Art. 28.
- [ ] **One-page processing record (ROPA, Art. 30)** — save this with the DPA:
      *Controller: [full name], Croatia, slavkogrbic25@gmail.com. Activity:
      hosting online card-game matches. Data: self-chosen nickname, avatar id,
      game moves, voice messages the player records (1.5.0), IP address.
      Subjects: players. Recipients: Hetzner Online
      GmbH (processor, Germany). Transfers outside EU: none. Retention: match
      duration in memory; voice clips (1.5.0) only while relayed, never
      stored; container logs ≤ a few days by rotation. Security:
      TLS, firewall (22/80/443 only), no persistence, no database.*
      *Second activity (1.3.1): handling player reports received by e-mail.
      Data: reported nickname, table code, time, app version, the reporter's
      e-mail address and message. Basis: Art. 6(1)(f). Recipient: the e-mail
      provider of the reports address. Retention: at most 90 days after the
      report is handled.*

## Handling a report

Reports arrive at **prijave@belastih.com**: Porkbun's free email forwarding
for belastih.com (MX fwd1/fwd2.porkbun.com, set up 2026-09-23) delivers them
to the owner's Gmail. Porkbun → Domain Management → belastih.com → Email is
where the forward is changed.

1. Reply within 7 days (the rules page promises it).
2. If the nickname breaks the rules, add its offending word (not the whole
   name, and in both scripts where it matters) to `BLOCKED_NAME_PARTS` in
   `apps/server/src/names.ts`, run the tests, and deploy the SERVER only
   (between games). The seat then shows "Igrač N".
3. Delete the e-mail at most 90 days after handling it.

## Play Console answers (at listing time)

- **Data safety form**: nickname/avatar/moves are transmitted but qualify for
  the **ephemeral processing** carve-out (in-memory, only as long as the
  match) → declare the flow inside the form; the public badge honestly shows
  "No data collected". Answer the Data deletion section explicitly: no
  accounts, nothing stored, delete-by-uninstall.
  **1.5.0 adds Audio → "Voice or sound recordings"**: transmitted off the
  device (to the server and on to the other players at the table), processed
  ephemerally (relayed, never stored), optional (the player chooses to hold
  the button; can be switched off), purpose App functionality, not shared
  with third parties (a user-initiated transfer to other players). Re-answer
  the form BEFORE 1.5.0 reaches any track.
- **Privacy policy URL**: `https://belastih.com`.
- **Account deletion policy**: N/A — the app has no accounts.
- **UGC questionnaire**: answer truthfully — users choose a display name shown
  to 3 other players per match and can send emotes from a fixed list and
  gifts from a fixed 15-item list; no free-text chat; from 1.5.0 short voice
  messages (≤ 15 s, push-to-talk) to the other players at the table, relayed
  and never stored, with per-player mute, hide and report; content is
  ephemeral; players can leave a table at any time. In-app (1.3.1): hide a
  player for the table, report a player by e-mail; the rules of conduct are
  accepted at the nickname field; objectionable nicknames are blocked
  server-side.
- **IARC content rating**: answer **"users interact" = yes** (nicknames +
  emotes + gifts with strangers; from 1.5.0 also voice messages between
  players, strangers included - re-answer before 1.5.0 ships). Answer **no** to every gambling question —
  nothing is wagered, coins cannot be bought or cashed out. Expected rating:
  low (PEGI 3/7 tier with an "interaction" notice). From 1.3.0 see the
  re-answer below: three gifts are drinks.

## 1.3.0 IARC re-answer (prepared — do it BEFORE 1.3.0 reaches any track)

Gifts add three drinks (rakija, pivo, gemišt — pictures and names only,
nothing is consumed or rewarded for drinking). Console → App content →
Content rating → start a new questionnaire and answer:

- **Alcohol, tobacco or drugs — references or depictions: YES**, alcohol,
  shown as a gift icon; no use by characters, no encouragement.
- **Gambling / simulated gambling: NO** to every question — no wagering,
  coins are never bought or cashed out, gifts cost a fixed price.
- **Loot boxes / random items for purchase: NO** — every gift is picked, never
  drawn.
- **Users interact: YES** (nicknames, emotes and gifts between strangers).
- **Shares location / digital purchases: NO** (no IAP of any kind).

Expect an alcohol-reference descriptor and possibly a higher age tier. Read
the new certificate before promoting 1.3.0. If the rating would cost the
13+ audience declaration, the drinks come out with one line: filter
`alcohol: true` out of `GIFTS` in `packages/progression`.
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
2. Coins can never be redeemed or transferred — a gift spends the sender's
   coins and credits no one.
3. Nothing of value is staked on a match outcome.
4. No accounts / no server-side storage of player data (until the sign-in
   phase, which re-opens the data-safety and deletion questions by design).
5. No free-TEXT channels between players (nicknames stay the only free text,
   sanitized server-side). The one free channel is voice (1.5.0): push-to-talk
   clips, relayed and never stored, with mute / hide / report and an off
   switch at the table and in Settings. Anything that would keep audio (a
   recording, a transcript) re-opens the Data safety form and the privacy page.
6. Hiding is device-local and a report is the player's own e-mail: neither
   ever reaches the game server. A server-side report endpoint would re-open
   the Data safety form and the privacy page.
