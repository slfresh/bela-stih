import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { measure, render, SFX, toWav, TRIM } from './sfx-bank.mjs';

/**
 * Writes the sound bank to apps/mobile/assets/sfx. The sounds themselves live
 * in sfx-bank.mjs.
 *
 *   node scripts/make-sfx.mjs
 *
 * SFX_OUT overrides the folder (the bank test renders into a temp dir).
 */

const OUT = process.env.SFX_OUT ?? join(process.cwd(), 'apps', 'mobile', 'assets', 'sfx');

mkdirSync(OUT, { recursive: true });
console.log('Writing sfx to', OUT);
let total = 0;
for (const name of Object.keys(SFX)) {
  const samples = render(name);
  const wav = toWav(samples);
  writeFileSync(join(OUT, `${name}.wav`), wav);
  total += wav.length;
  const { rmsDb, peakDb } = measure(samples);
  console.log(
    `  ${name.padEnd(10)} ${(wav.length / 1024).toFixed(1).padStart(6)}KB` +
      `  rms ${rmsDb.toFixed(1)} dBFS (trim ${(TRIM[name] ?? 0) >= 0 ? '+' : ''}${TRIM[name] ?? 0})` +
      `  peak ${peakDb.toFixed(1)} dBFS`,
  );
}
console.log(`Done — ${(total / 1024).toFixed(0)}KB total.`);
