import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The four faces the tokens name exist, are real TrueType files of a sane
 * size, carry the licence beside them, and are the ones App registers.
 */
describe('the typeface', () => {
  const dir = join(__dirname, '../assets/fonts');
  for (const w of ['400', '500', '700', '900']) {
    it(`ships Rubik-${w} as a subset TrueType file`, () => {
      const p = join(dir, `Rubik-${w}.ttf`);
      expect(existsSync(p), p).toBe(true);
      const size = statSync(p).size;
      expect(size).toBeGreaterThan(20_000);
      expect(size).toBeLessThan(120_000);
      const head = readFileSync(p).subarray(0, 4);
      expect(head.readUInt32BE(0)).toBe(0x00010000); // TrueType outlines
    });
  }

  it('carries its licence and is registered under the token names', () => {
    expect(existsSync(join(dir, 'OFL.txt'))).toBe(true);
    const app = readFileSync(join(__dirname, '../App.tsx'), 'utf8');
    for (const w of ['400', '500', '700', '900']) expect(app).toContain(`'Rubik-${w}': require('./assets/fonts/Rubik-${w}.ttf')`);
    expect(app).toMatch(/useFonts\(FONTS\)/);
  });
});
