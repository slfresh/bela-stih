// The golden corpus replayed in a browser: the same rules, bundled for the
// web, must hash every deal exactly as Node did (packages/engine/test/golden).
// This is the web export's runtime; the phone's (Hermes) is the plan's R1.
//
//   node scripts/golden-chromium.mjs            # exit 1 on any difference
//
// Uses the Chromium Playwright installed (`npx playwright install chromium`),
// or the machine's Chrome when that is not there.
import { execSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';

const expected = JSON.parse(readFileSync('packages/engine/test/golden/expected.json', 'utf8'));
const dir = mkdtempSync(join(tmpdir(), 'bela-golden-'));
const bundle = join(dir, 'golden.js');
execSync(
  `npx esbuild packages/engine/test/golden/run.ts --bundle --format=iife --global-name=goldenRunner --target=es2020 --outfile="${bundle}"`,
  { stdio: 'inherit' },
);

async function launch() {
  try {
    return await chromium.launch();
  } catch {
    return chromium.launch({ channel: 'chrome' });
  }
}

const browser = await launch();
try {
  const page = await browser.newPage();
  writeFileSync(join(dir, 'index.html'), '<!doctype html><title>golden</title>');
  await page.goto('file://' + join(dir, 'index.html').replace(/\\/g, '/'));
  await page.addScriptTag({ content: readFileSync(bundle, 'utf8') });
  const started = Date.now();
  const report = await page.evaluate(() => globalThis.goldenRunner.runGolden());
  const ms = Date.now() - started;
  let bad = 0;
  for (const [i, s] of report.scenarios.entries()) {
    const was = expected.scenarios[i];
    if (!was || was.name !== s.name) {
      console.log(`!! scenario ${i}: ${s.name} vs ${was?.name}`);
      bad++;
      continue;
    }
    const d = s.dealHashes.findIndex((h, k) => h !== was.dealHashes[k]);
    if (d >= 0 || s.dealHashes.length !== was.dealHashes.length) {
      console.log(`!! ${s.name}: deal ${d + 1} differs in Chromium (${s.dealHashes[d]} vs ${was.dealHashes[d]})`);
      bad++;
    }
  }
  console.log(`${report.scenarios.length} scenarios, ${report.scenarios.reduce((n, s) => n + s.deals, 0)} deals in ${ms} ms in ${browser.version()}`);
  if (report.hash !== expected.hash) {
    console.log(`!! corpus hash ${report.hash} in Chromium, ${expected.hash} in Node`);
    bad++;
  }
  if (bad) process.exit(1);
  console.log('ok: Chromium hashes the golden corpus exactly as Node does');
} finally {
  await browser.close();
  rmSync(dir, { recursive: true, force: true });
}
