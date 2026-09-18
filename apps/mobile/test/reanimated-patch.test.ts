import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * The reanimated event guard (scripts/patch-reanimated.mjs).
 *
 * Without it a new hand, the result sheet or a rematch could hold Android's
 * main thread for seconds: every SVG layout event during a draw re-applied
 * every recently animated view, unmounted ones included, each failure logged
 * with a stack trace. Play recorded it as an ANR ("Input dispatching timed
 * out") on a Redmi, and a player saw the app throw them off the table after a
 * couple of games with the bots.
 *
 * The patch lives in node_modules, so an install that skipped the
 * postinstall, or a reanimated upgrade, would silently bring the freeze back.
 * These fail first.
 */

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(here, '../package.json'));
const reanimated = dirname(require.resolve('react-native-reanimated/package.json'));
const nodesManager = () =>
  readFileSync(join(reanimated, 'android/src/main/java/com/swmansion/reanimated/NodesManager.kt'), 'utf8');

describe('the reanimated event guard', () => {
  it('is applied to the installed reanimated', () => {
    const kt = nodesManager();
    const ui = kt.slice(kt.indexOf('if (UiThreadUtil.isOnUiThread()) {'), kt.indexOf('} else {', kt.indexOf('if (UiThreadUtil.isOnUiThread()) {')));
    expect(ui).toMatch(/\[bela-stih patch\]/);
    // The guard comes BEFORE the handling and the flush, and returns early.
    const guard = ui.indexOf('if (mNativeProxy?.isAnyHandlerWaitingForEvent(resolvedName, event.viewTag) != true) return');
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(ui.indexOf('handleEvent(event)'));
    expect(guard).toBeLessThan(ui.indexOf('performOperationsRespectingDrawPass()'));
  });

  it('is pinned to the reanimated it was written against', () => {
    const pkg = JSON.parse(readFileSync(join(here, '../package.json'), 'utf8'));
    // Exact, never a range: an upgrade must be a decision that re-reads the patch.
    expect(pkg.dependencies['react-native-reanimated']).toBe('4.5.1');
    const script = readFileSync(join(here, '../../../scripts/patch-reanimated.mjs'), 'utf8');
    expect(script).toMatch(/const VERSION = '4\.5\.1';/);
    expect(JSON.parse(readFileSync(join(reanimated, 'package.json'), 'utf8')).version).toBe('4.5.1');
  });

  it('runs after every install and before every Android build', () => {
    const pkg = JSON.parse(readFileSync(join(here, '../package.json'), 'utf8'));
    expect(pkg.scripts.postinstall).toBe('node ../../scripts/patch-reanimated.mjs');
    // A plain \`npm install\` on an installed tree skips postinstall; a dev build patches first.
    expect(pkg.scripts.android).toMatch(/^node \.\.\/\.\.\/scripts\/patch-reanimated\.mjs && expo run:android$/);
    const build = readFileSync(join(here, '../../../scripts/build-android.sh'), 'utf8');
    const patch = build.indexOf('node scripts/patch-reanimated.mjs');
    expect(patch).toBeGreaterThan(-1);
    // set -e is what makes a failed patch stop the build.
    expect(build).toMatch(/^set -euo pipefail$/m);
    expect(patch).toBeLessThan(build.indexOf('./gradlew'));
  });
});
