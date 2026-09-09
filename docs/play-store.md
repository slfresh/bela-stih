# Play Store runbook

Everything for the Console, in order. Form answers live in
[compliance-checklist.md](compliance-checklist.md) — this file is the
click-path plus the copy-paste texts and assets.

## 0. One-time: the developer account

play.google.com/console → sign in with your Google account → **Personal**
account type → $25 one-time fee. Identity verification can take a day or two —
start it before anything else. (Personal accounts must do the 12-tester closed
test before production; that is our plan anyway.)

## 1. Create the app

Console → **Create app** → name **Bela Štih** · language **Croatian** ·
**Game** · **Free** → accept declarations.

## 2. Store listing (copy-paste)

**App name:** `Bela Štih`

**Short description (hr, ≤80 chars):**
`Prava bela s prijateljima — online ili protiv botova. Bez prijave i reklama.`

**Full description (hr):**
```
Bela kakvu igraš nedjeljom — na mobitelu.

• Igraj online s prijateljima: napravi stol i pošalji im poveznicu, upadaju
  jednim dodirom
• Ili odmah protiv botova, bez interneta
• Prave mađarice: zvanja, bela, štih-mač... sve po pravilima do 1001
• Zovi zvanja na vrijeme — što se ne zove, propada!
• Skupljaj novčiće, otključavaj avatare, poleđine karata i stolove
• Dnevni bonusi i zadaci

Bez prijave. Bez reklama. Bez kupnji — novčići se zarađuju samo igranjem i
ne mogu se kupiti ni unovčiti.

Napravljeno s ljubavlju prema beli. Dobar štih!
```

**Short description (en):**
`Real Balkan Bela with friends — online or vs bots. No sign-up, no ads.`

**Full description (en):**
```
The card game you play on Sunday afternoons — on your phone.

• Play online with friends: open a table and send them a link, they join in
  one tap
• Or play instantly against bots, no internet needed
• Authentic Tell-pattern cards: declarations, bela, all the real rules to 1001
• Earn coins, unlock avatars, card backs and table felts
• Daily bonuses and quests

No account. No ads. No purchases — coins are earned by playing only, and can
never be bought or cashed out.
```

**Assets** (all in `apps/mobile/store/` + screenshots below):
- App icon 512×512: `store/icon-512.png`
- Feature graphic 1024×500: `store/feature-graphic.png`
- Phone screenshots (need 2–8): `store/screens-cropped/*.png`, 1080×2160, 24-bit PNG.
  Play refuses a frame whose long side is more than twice its short side, so the
  raw 1080×2400 captures in `store/screens/` are NOT uploadable: the cropped set
  is the same frames with 120 px taken off the top and 120 off the bottom, which
  removes both system bars and lands on exactly 1:2.

**Category:** Games → Card. **Contact email:** slavkogrbic25@gmail.com.
**Privacy policy URL:** `https://belastih.com`

## 3. App content forms

Work through Console → App content, with the answers from
[compliance-checklist.md](compliance-checklist.md): Data safety (ephemeral →
"No data collected" badge), no account-deletion (no accounts), UGC
questionnaire (nicknames + fixed emotes, ephemeral, leave-table), IARC
("users interact" = yes, all gambling = no), target audience **13+**,
**non-trader** DSA declaration, no ads.

## 4. Upload the build

The signed AAB comes from EAS (`npx eas-cli build -p android --profile
production` in `apps/mobile`; download from expo.dev). Console → Testing →
**Internal testing** → create release → upload the `.aab` → add your own
Google account as tester → install via the opt-in link and sanity-check.

Then **Closed testing** → create track → same AAB → add testers (12 minimum,
recruit 15–16) → they opt in via the link and must stay opted in for **14
continuous days** before Console unlocks the production application.

## 5. App Links fingerprint (after first upload)

Console → Setup → App integrity → App signing → copy the **SHA-256
certificate fingerprint** → paste into
`deploy/site/.well-known/assetlinks.json` over the placeholder (keep the
upload-key entry too — both may be listed) → redeploy
(`bash scripts/deploy-server.sh root@167.233.205.118 belastih.com`). This
makes `https://belastih.com/join/…` links open the app directly on Android 12+.

## 6. Signing & rebuilds — facts to not lose

- **Upload keystore**: `apps/mobile/credentials/upload-keystore.jks` +
  passwords in `keystore.properties` next to it. **Back this folder up**
  (password manager / USB stick). Losing it is recoverable via Play support,
  but painful. Never commit it to a public repo.
- EAS builds use it via `credentials.json` (`credentialsSource: "local"`).
- Local release builds work too (`./gradlew bundleRelease` with
  `EXPO_PUBLIC_SERVER_URL=wss://belastih.com` exported) — the signing config
  in `android/app/build.gradle` reads the same keystore, but that edit is
  wiped by `expo prebuild` and must be re-applied (or just use EAS).
- Colyseus versions stay pinned in lockstep: 0.16.22 client + server.

## 7. Before the production application

- Re-run the on-device pass with the **release** build (install the internal-
  testing version from Play, not the dev APK): offline deal, online match on
  mobile data, invite link, emotes, shop, language switch.
- OSS notices page (see compliance checklist release gates).
- UptimeRobot on `https://belastih.com/health` if not yet done.
