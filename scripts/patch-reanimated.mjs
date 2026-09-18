#!/usr/bin/env node
// One guard in react-native-reanimated's Android event path. Without it the app
// froze until Android offered to close it.
//
//   node scripts/patch-reanimated.mjs          # patch (idempotent) and verify
//   node scripts/patch-reanimated.mjs --check  # verify only; exit 1 if unpatched
//
// What happens without it (reanimated 4.5.1, and unchanged up to 4.7.0):
// NodesManager.onEventDispatch runs for EVERY native event on the UI thread,
// whether or not any worklet listens for it. When the event arrives while
// Android is drawing, it calls performNonLayoutOperations, and that re-applies
// the props of every view reanimated has animated in the last two seconds —
// the whole registry, not what changed. A view that has already unmounted fails
// that update and costs a Log.w with a full stack trace (about 1 ms each).
//
// react-native-svg dispatches a layout event from inside draw for every SVG
// element whose box changed, and every card face here is SVG. A new hand, the
// result sheet or a rematch lays out hundreds of elements at once, just as the
// last deal's sprites, bubbles and coins are unmounting: hundreds of events
// times dozens of dead views, a whole second on the Samsung and several on a
// slower phone. The one ANR Play recorded (a Redmi, 1.2.5) is exactly this
// stack, and "Input dispatching timed out" is the dialog that ends with the
// player back on the home screen.
//
// An event nobody waits for has nothing to handle and nothing to flush, so the
// guard below skips both — the same check reanimated already makes for events
// off the UI thread. Handlers registered on a view (useAnimatedScrollHandler,
// useEvent, gesture worklets) are keyed by that view's tag and still get every
// event; this app registers none today. Animations are unaffected: they flush
// on the frame callback as always.
//
// Run by apps/mobile's postinstall and by scripts/build-android.sh, which will
// not build without it. Any reanimated upgrade must re-check this patch: the
// script refuses a version it was not written against.
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const VERSION = '4.5.1';
const MARKER = '[bela-stih patch]';

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(here, '../apps/mobile/package.json'));
const pkgJson = require.resolve('react-native-reanimated/package.json');
const root = dirname(pkgJson);
const file = join(root, 'android/src/main/java/com/swmansion/reanimated/NodesManager.kt');
const checkOnly = process.argv.includes('--check');

const fail = (msg) => {
  console.error(`!! patch-reanimated: ${msg}`);
  process.exit(1);
};

const version = JSON.parse(readFileSync(pkgJson, 'utf8')).version;
if (version !== VERSION) {
  fail(`react-native-reanimated is ${version}, this patch was written against ${VERSION}. ` +
    'Read scripts/patch-reanimated.mjs, check whether the new version still re-applies the whole ' +
    'registry on every draw-pass event, and update VERSION and the patch together.');
}

const src = readFileSync(file, 'utf8');
const eol = src.includes('\r\n') ? '\r\n' : '\n';
const lines = (...ls) => ls.join(eol);

const ORIGINAL = lines(
  '            if (UiThreadUtil.isOnUiThread()) {',
  '                // Ensure draw-pass tracking is attached before event handling; the backend reads',
  '                // isInDrawPass during receiveEvent.',
  '                mDrawPassDetector.initialize()',
  '                handleEvent(event)',
  '                performOperationsRespectingDrawPass()',
);
const PATCHED = lines(
  '            if (UiThreadUtil.isOnUiThread()) {',
  `                // ${MARKER} An event no worklet listens for has nothing to handle`,
  '                // and nothing to flush. Flushing anyway re-applied every animated view,',
  '                // dead ones included, once per SVG layout event during a draw: seconds',
  '                // of main thread on a new hand. See scripts/patch-reanimated.mjs.',
  '                val resolvedName = mCustomEventNamesResolver.resolveCustomEventName(event.eventName) ?: event.eventName',
  '                if (mNativeProxy?.isAnyHandlerWaitingForEvent(resolvedName, event.viewTag) != true) return',
  '                // Ensure draw-pass tracking is attached before event handling; the backend reads',
  '                // isInDrawPass during receiveEvent.',
  '                mDrawPassDetector.initialize()',
  '                handleEvent(event)',
  '                performOperationsRespectingDrawPass()',
);

const patched = src.includes(PATCHED);
const original = src.split(ORIGINAL).length - 1;

if (patched) {
  if (src.split(MARKER).length - 1 !== 1) fail(`${file} carries the marker more than once`);
  console.log(`   reanimated ${version}: event guard in place`);
  process.exit(0);
}
if (checkOnly) fail(`${file} is not patched; run node scripts/patch-reanimated.mjs`);
if (original !== 1) {
  fail(`${file} does not contain the expected onEventDispatch block exactly once (found ${original}); ` +
    'the upstream code moved — re-derive the patch by hand.');
}
writeFileSync(file, src.replace(ORIGINAL, PATCHED));
const after = readFileSync(file, 'utf8');
if (!after.includes(PATCHED)) fail('the write did not take');
console.log(`   reanimated ${version}: event guard applied to ${file}`);
