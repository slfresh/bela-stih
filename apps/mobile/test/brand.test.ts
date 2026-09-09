import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import PATHS from '../brand/paths.json';
import { garb } from '../src/deck/palette';

/**
 * One drawing for the pips: the cards on the table, the launcher icon and the
 * store art all draw the four suits from brand/paths.json. This keeps the
 * file honest and the three consumers on it.
 */
describe('the brand paths', () => {
  it('carry all four mađarice suits, each at least one shape on the 100-unit canvas', () => {
    expect(PATHS.canvas).toBe(100);
    for (const suit of ['hearts', 'acorns', 'leaves', 'bells'] as const) {
      const shapes = PATHS.suits[suit];
      expect(shapes.length, suit).toBeGreaterThan(0);
      for (const s of shapes) {
        expect(s.d, suit).toMatch(/^M/);
        expect(Boolean(('fill' in s && s.fill) || ('stroke' in s && s.stroke)), `${suit} shape has no paint`).toBe(true);
      }
    }
  });

  it('paint only in the deck\'s garb palette', () => {
    const palette = new Set(Object.values(garb).map((c) => c.toLowerCase()));
    for (const shapes of Object.values(PATHS.suits)) {
      for (const s of shapes) {
        for (const c of [('fill' in s ? s.fill : undefined), ('stroke' in s ? s.stroke : undefined)]) {
          if (c) expect(palette.has(c.toLowerCase()), `${c} is not a garb colour`).toBe(true);
        }
      }
    }
  });

  it('are what the deck and both art scripts draw from', () => {
    const src = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');
    expect(src('src/deck/pips.tsx')).toMatch(/from '\.\.\/\.\.\/brand\/paths\.json'/);
    expect(src('src/deck/pips.tsx')).not.toMatch(/<Circle|<Rect/); // no shape drawn by hand any more
    const root = (p: string) => readFileSync(join(__dirname, '..', '..', '..', p), 'utf8');
    expect(root('scripts/brand.mjs')).toMatch(/brand', 'paths\.json'/);
    expect(root('scripts/make-icons.mjs')).toMatch(/from '\.\/brand\.mjs'/);
    expect(root('scripts/make-store-assets.mjs')).toMatch(/from '\.\/brand\.mjs'/);
    // The generated art is committed; the scripts must have been run.
    for (const f of ['icon.png', 'android-icon-foreground.png', 'android-icon-monochrome.png', 'splash-icon.png', 'favicon.png']) {
      expect(existsSync(join(__dirname, '..', 'assets', f)), f).toBe(true);
    }
  });
});
