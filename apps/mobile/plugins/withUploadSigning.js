const { withAppBuildGradle } = require('expo/config-plugins');

/**
 * Sign RELEASE builds with the upload keystore.
 *
 * EAS did the signing in the cloud, so the generated Android project never knew
 * about the upload key: its `release` build type is wired to `signingConfigs.debug`,
 * which is the stock Expo template and carries a "Caution!" comment saying so.
 * A local `gradlew assembleRelease` therefore produced a DEBUG-SIGNED artifact —
 * installable, but not something Play will accept, and nothing about the build
 * output says which key was used.
 *
 * `android/` is generated and gitignored, so this cannot live as a hand edit:
 * the next `expo prebuild` would drop it silently. As a plugin it is re-applied
 * every time the project is regenerated.
 *
 * The secrets stay out of both git and this file — Gradle reads them at build
 * time from `credentials/keystore.properties`, which is gitignored. If that file
 * is absent (a fresh clone, or CI), the release build falls back to the debug
 * key rather than failing, so `prebuild` still works for anyone without it.
 */

const RELEASE_SIGNING_CONFIG = `        release {
            // Read at build time from credentials/keystore.properties, which is
            // gitignored — no key material in the repo or in the plugin.
            def keystoreProps = rootProject.file('../credentials/keystore.properties')
            if (keystoreProps.exists()) {
                def props = new Properties()
                keystoreProps.withInputStream { props.load(it) }
                storeFile file(props['BELA_UPLOAD_STORE_FILE'])
                storePassword props['BELA_UPLOAD_STORE_PASSWORD']
                keyAlias props['BELA_UPLOAD_KEY_ALIAS']
                keyPassword props['BELA_UPLOAD_KEY_PASSWORD']
            }
        }
`;

const TEMPLATE_RELEASE_SIGNING = `        release {
            // Caution! In production, you need to generate your own keystore file.
            // see https://reactnative.dev/docs/signed-apk-android.
            signingConfig signingConfigs.debug`;

const PATCHED_RELEASE_SIGNING = `        release {
            // Signed with the upload key when credentials/keystore.properties is
            // present, and with the debug key when it is not.
            signingConfig signingConfigs.release.storeFile != null ? signingConfigs.release : signingConfigs.debug`;

const DEBUG_SIGNING_BLOCK = `        debug {
            storeFile file('debug.keystore')
            storePassword 'android'
            keyAlias 'androiddebugkey'
            keyPassword 'android'
        }
`;

module.exports = function withUploadSigning(config) {
  return withAppBuildGradle(config, (cfg) => {
    let gradle = cfg.modResults.contents;

    if (gradle.includes("props['BELA_UPLOAD_STORE_FILE']")) return cfg; // already applied

    // Anchors are matched exactly and asserted. If the Expo template changes,
    // this must fail loudly at prebuild rather than quietly leaving release
    // builds on the debug key — the whole failure mode it exists to prevent.
    if (!gradle.includes(DEBUG_SIGNING_BLOCK)) {
      throw new Error(
        'withUploadSigning: could not find the debug signingConfig block to anchor to. ' +
          'The Expo template has changed; update apps/mobile/plugins/withUploadSigning.js.',
      );
    }
    if (!gradle.includes(TEMPLATE_RELEASE_SIGNING)) {
      throw new Error(
        'withUploadSigning: could not find the release buildType signingConfig line. ' +
          'The Expo template has changed; update apps/mobile/plugins/withUploadSigning.js.',
      );
    }

    gradle = gradle.replace(DEBUG_SIGNING_BLOCK, DEBUG_SIGNING_BLOCK + RELEASE_SIGNING_CONFIG);
    gradle = gradle.replace(TEMPLATE_RELEASE_SIGNING, PATCHED_RELEASE_SIGNING);

    cfg.modResults.contents = gradle;
    return cfg;
  });
};
