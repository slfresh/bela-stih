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
questionnaire (nicknames + fixed emotes + fixed gifts, ephemeral,
leave-table), IARC ("users interact" = yes, all gambling = no), target
audience **13+**, **non-trader** DSA declaration, no ads.

**Before 1.3.0 goes to any track:** re-answer the UGC and IARC
questionnaires as prepared in the compliance checklist ("1.3.0 IARC
re-answer" — the drinks are alcohol references). Read the new certificate
before promoting.

### Release notes

1.4.3 (versionCode 28: three versions of the game - Učenje, Lagana, Prava bela) -
- hr: *Novo: tri verzije igre. Učenje te vodi kroz partiju: savjet za svaki
  potez i zašto, i pazi na štiglju. U Laganoj zvanja tražiš i prijavljuješ bez
  pomoći, a kriva karta se ne može odigrati. U Pravoj beli kriva karta gubi
  dijeljenje, a aplikacija pokaže koja je karta odigrana i koja je trebala ići.
  Na privatnom stolu verziju bira domaćin i svi vide koja se igra; brza igra je
  uvijek Lagana. Popravak: Prijavi i Nemam više nisu ispod Androidovih tipki.*
- sr: *Ново: три верзије игре. Учење те води кроз партију: савет за сваки
  потез и зашто, и пази на штигљу. У Лаганој звања тражиш и пријављујеш без
  помоћи, а погрешна карта не може да се одигра. У Правој бели погрешна карта
  губи дељење, а апликација покаже која је карта одиграна и која је требало да
  иде. За приватним столом верзију бира домаћин и сви виде која се игра; брза
  игра је увек Лагана. Поправка: Пријави и Немам више нису испод Андроидових
  тастера.*
- en: *New: three versions of the game. Learning guides you through the match:
  a tip for every move and why, and a watch on štiglja. In Casual you find and
  call your declarations without help, and a wrong card cannot be played. In
  True bela a wrong card loses the deal, and the app shows which card went and
  which should have. At a private table the host picks the version and
  everyone sees it; quick play is always Casual. Fix: Declare and Nothing no
  longer sit under Android's buttons.*

1.4.2 (versionCode 27: the first 1.4 build whose reports reach someone - prijave@belastih.com. 25 and 26 carried the placeholder; all three carry 1.3.1, which never shipped on its own) -
- hr: *Novo: pozovi prijatelje kodom, poveznicom ili QR kodom; povijest
  partija s prijateljima i statistika; domaćin bira dužinu partije
  (501/701/1001) i Pravu belu; pauza dok se prijatelj vrati; „Kako se igra”;
  nove brze poruke; pogled na zadnji štih. Trgovina pita prije kupnje, profil
  i postavke su pregledniji, karte složiš dugim pritiskom, a online potez ide
  samo jednom. Igrača možeš sakriti ili prijaviti. I puno sitnih popravaka.*
- sr: *Ново: позови пријатеље кодом, везом или QR кодом; историја партија са
  пријатељима и статистика; домаћин бира дужину партије (501/701/1001) и
  Праву белу; пауза док се пријатељ врати; „Како се игра”; нове брзе поруке;
  поглед на задњи штих. Продавница пита пре куповине, профил и подешавања су
  прегледнији, карте сложиш дугим притиском, а онлајн потез иде само једном.
  Играча можеш да сакријеш или пријавиш. И пуно ситних поправки.*
- en: *New: invite friends by code, link or QR code; your match history with
  friends and its statistics; the host picks the match length (501/701/1001)
  and True bela; a pause while a friend reconnects; "How to play"; new quick
  phrases; a look at the last trick. The shop asks before you buy, the profile
  and settings are clearer, hold your cards to arrange them, and an online move
  is sent exactly once. You can hide or report a player. Plus many small fixes.*

1.3.1 (not shipped on its own; folded into 1.4.0) -
- hr: *Novo: dodirni igrača za stolom → Prijavi da ga sakriješ do kraja stola
  ili prijaviš neprimjeren nadimak. Popravci: nakon partije uvijek imaš put
  natrag, traka iskustva više ne ide unatrag, oblačići se vide i kad su
  animacije na telefonu isključene, a online stol jasnije javlja odbijen potez
  i za koga igra bot. Povratak za stol nakon prekida veze više ne pokazuje
  brojke prethodnog dijeljenja.*
- sr: *Ново: додирни играча за столом → Пријави да га сакријеш до краја стола
  или пријавиш неприкладан надимак. Поправке: после партије увек имаш пут
  назад, трака искуства више не иде уназад, облачићи се виде и кад су
  анимације на телефону искључене, а онлајн сто јасније јавља одбијен потез и
  за кога игра бот. Повратак за сто након прекида везе више не приказује
  бројке претходног дељења.*
- en: *New: tap a player at the table → Report to hide them for the rest of
  the table or report an offensive nickname. Fixes: a way home after every
  match, the XP bar never runs backwards, speech bubbles show even with the
  phone's animations off, and the online table says clearly when a move is
  refused and who a bot is playing for. Coming back after a dropped connection
  no longer shows the previous deal's numbers.*


Internal testing goes out without notes. For closed testing and production:

1.3.0 —
- hr: *Novo: darovi za stolom! Dodirni igrača i pošalji mu kavu, kolač ili
  ružu — ili počasti cijeli stol. Dar je samo za veselje: plaća se
  novčićima, a primatelj ne dobiva ništa. Igra je glađa, zvukovi više ne
  zaustavljaju tvoju glazbu, a ispravljeno je ponovno pokretanje telefona
  koje se na nekim Samsung uređajima događalo nakon duže igre.*
- sr (the app's Serbian is Cyrillic): *Ново: поклони за столом! Додирни
  играча и пошаљи му кафу, колач или ружу — или почасти цео сто. Поклон је
  само за забаву: плаћа се новчићима, а прималац не добија ништа. Игра је
  глађа, звукови више не заустављају твоју музику, а исправљено је поновно
  покретање телефона које се на неким Samsung уређајима дешавало после дуже
  игре.*
- en: *New: table gifts! Tap a player to send them a coffee, a cake or a rose
  — or treat the whole table. Gifts are just for fun: they cost your coins
  and give the receiver nothing. Smoother play, sound effects no longer
  pause your music, and a phone restart some Samsung devices hit after a
  long game is fixed.*

## 4. Upload the build

The signed AAB comes from `bash scripts/build-android.sh`, and only from
there: it is the one path that reads the finished bundle back and refuses a
build whose report address is still the placeholder, whose server URL is wrong
or whose audio patch did not take. (An EAS cloud build - `npx eas-cli build -p
android` - runs none of those checks, so it is not the way this app ships.)
Console → Testing →
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
