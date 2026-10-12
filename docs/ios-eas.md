# iOS and EAS cloud builds

The Expo client (`apps/mobile`) builds for iOS from the same source as Android,
with the native project generated on the build machine (`ios/` is gitignored,
like `android/`). The Android release is still made locally by
`scripts/build-android.sh`; iOS has no local toolchain requirement at all: EAS
builds it in the cloud and hands back an `.ipa` or a simulator `.app`.

## What the app does on iOS

Nothing in the client is Android-only any more:

- **Back.** The hardware-back handler in `App.tsx` runs on Android alone. iOS
  has no back button, and every screen carries its own back chevron; the
  browser's Back is handled by `src/ui/webBack.ts`.
- **Haptics** go through `expo-haptics`: iOS gets the impact / notification /
  selection patterns in `src/haptics.ts`, Android its named constants.
- **Sound** is `expo-audio` with `playsInSilentMode` on (a card game with the
  mute switch flipped still clicks). The one-shot players exist for Android's
  40-track limit only (`ONE_SHOTS` in `src/audio.ts`); iOS pools everything.
- **Voice messages** record AAC in `.m4a` on both phones
  (`src/voice/voice.ts`) and live in `Paths.cache` from `expo-file-system`;
  no platform path is ever spelled out.
- **Storage** is `react-native-mmkv` on both phones, `localStorage` on the web.
- **Safe areas.** Every screen's root is a `SafeAreaView` from
  `react-native-safe-area-context` under the one `SafeAreaProvider` in
  `App.tsx`, so nothing sits under the notch, the Dynamic Island or the home
  indicator; the table subtracts the insets itself (`src/table/useTableMetrics.ts`)
  before it lays out the felt, the fan and the rails, in both orientations.
- **The keyboard.** The scroll views that hold a text field (the join code on
  Home, the nickname in Settings and Profile) scroll clear of the keyboard and
  let a button be pressed while it is up.

`apps/mobile/test/ios-config.test.ts` pins all of this, plus the config below.

## `app.json`

| key | value | why |
| --- | --- | --- |
| `ios.bundleIdentifier` | `com.slfresh.belastih` | the Android package, so one id names the app in both stores and in the universal-link file |
| `ios.buildNumber` | `31` | seeded from `android.versionCode`; EAS increments it (`autoIncrement`, remote version source) |
| `ios.supportsTablet` | `true` | iPad; `orientation: default` already allows every orientation, which iPad multitasking requires |
| `ios.icon` | `assets/ios-icon.png` | opaque: App Store Connect refuses any transparency, and Expo would flatten `icon.png`'s clear corners onto white |
| `ios.associatedDomains` | `applinks:belastih.com` | the iOS half of the Android `intentFilters`: `https://belastih.com/join/CODE` opens the table |
| `ios.config.usesNonExemptEncryption` | `false` | TLS only; skips the export-compliance question on every TestFlight upload |
| `ios.infoPlist.CFBundleLocalizations` | `hr`, `sr`, `en` | what the App Store lists as supported languages |
| `ios.privacyManifests` | no tracking, nothing collected | the same promise the Play data-safety form makes (`docs/compliance-checklist.md`) |

The splash screen and the microphone text come from the `expo-splash-screen`
and `expo-audio` plugins, which configure both platforms from the one entry.

## `eas.json`

| profile | what it makes |
| --- | --- |
| `development` | a dev client (`expo-dev-client`) for a registered device, internal distribution; run `npx expo start --dev-client` against it |
| `development-simulator` | the same for the iOS simulator |
| `preview` | a release build for registered devices (ad-hoc), internal distribution |
| `preview-simulator` | a release build for the iOS simulator |
| `production` | the store build: App Store distribution, build number auto-incremented, credentials from EAS |

Every profile bakes `EXPO_PUBLIC_SERVER_URL=wss://belastih.com` into the
bundle, the same belt `scripts/build-android.sh` wears.

```bash
cd apps/mobile
eas build -p ios --profile development          # or development-simulator
eas build -p ios --profile preview              # or preview-simulator
eas build -p ios --profile production
eas submit -p ios --profile production          # asks for the Apple ID and the App Store Connect app
```

The first `eas build -p ios` asks to sign in with the Apple Developer account
and creates the distribution certificate and provisioning profile on EAS
(`credentialsSource: remote`); ad-hoc and development builds need each test
phone registered first (`eas device:create`). EAS enables the Associated
Domains capability from `associatedDomains` when it manages the credentials.

`eas submit`'s iOS fields (`appleId`, `ascAppId`, `appleTeamId`) are left out
of `eas.json` on purpose: they are account details, and the CLI asks for what
it needs. Add them once the App Store Connect record exists.

## Universal links

`deploy/site/.well-known/apple-app-site-association` is the iOS counterpart of
`assetlinks.json`. **Its `TEAMID` is a placeholder**: replace it with the Apple
Developer Team ID (Membership details, or `eas credentials`) before the first
iOS build ships, or the link falls back to the join page. Caddy serves the file
as `application/json`, which Apple insists on. The join page itself opens the
app through its `belastih://` scheme on an iPhone (no App Store listing yet to
fall back to).

## Checks

```bash
bash scripts/typecheck.sh                       # root, mobile, server
npx vitest run apps/mobile/test/ios-config.test.ts
cd apps/mobile && npx expo prebuild --platform ios --no-install   # on a Mac: the generated project, to inspect
```
