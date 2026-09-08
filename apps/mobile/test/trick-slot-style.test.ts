import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { slotOffsets, type Position } from '../src/table/geometry';

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(here, '../src/TableScreen.tsx'), 'utf8');

/**
 * The trick slots are placed with `marginLeft` / `marginTop` from `slotOffsets`,
 * and the played-card style is composed on top of them.
 *
 * On native that composition is a shallow key merge, and Yoga resolves the
 * edge-specific value ahead of the `margin` shorthand. react-native-web instead
 * emits real CSS, where the shorthand RESETS the longhands — so a single
 * `margin: -2` in the played-card style collapsed all four cards onto the same
 * pixel in the centre of the felt, each one hiding the one before it. The bug
 * was invisible on a phone and only ever showed up in the browser.
 *
 * A static scan of the style array cannot catch this: the longhands arrive
 * through the `slots[pos]` variable, not as literal text. So pin the one style
 * object that is known to be composed over them.
 */
describe('the played-card style composed over a trick slot', () => {
  const played = source.match(/played\s*\?\s*\{([\s\S]*?)\}\s*:\s*null/);

  it('is where this test thinks it is', () => {
    expect(played).not.toBeNull();
  });

  it('sets no box-model shorthand that would reset the slot offsets', () => {
    const keys = [...played![1]!.matchAll(/^\s*([A-Za-z]+)\s*:/gm)].map((m) => m[1]);
    expect(keys).not.toContain('margin');
    expect(keys).not.toContain('padding');
    expect(keys).not.toContain('inset');
  });
});

describe('slotOffsets', () => {
  it('puts the four cards in four different places', () => {
    const offsets = slotOffsets(60, 87);
    const positions = (['bottom', 'top', 'left', 'right'] as Position[]).map(
      (p) => `${offsets[p].marginLeft},${offsets[p].marginTop}`,
    );
    expect(new Set(positions).size).toBe(4);
  });

  it('separates neighbouring slots by more than a card', () => {
    const { marginLeft: leftX } = slotOffsets(60, 87).left;
    const { marginLeft: rightX } = slotOffsets(60, 87).right;
    // Left and right must not overlap: their gap has to clear a whole card.
    expect(rightX - leftX).toBeGreaterThanOrEqual(60);
  });
});
