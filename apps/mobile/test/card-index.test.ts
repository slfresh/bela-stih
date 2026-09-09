import { describe, expect, it } from 'vitest';
import { RANKS } from '@belot/shared-types';
import { Lang, LOCALE_IDS } from '@belot/i18n';
import { cornerIndexLayout, indexBounds, INDEX_MAX_X, INDEX_MAX_Y } from '../src/deck/cornerIndex';

/**
 * The card art was drawn to dodge the corner box; the index must stay in it
 * for every label every locale can put there — Roman VIII included.
 */
describe('the corner index', () => {
  it('stays inside the box the art dodges, for every rank in every locale', () => {
    for (const id of LOCALE_IDS) {
      const lang = new Lang(id);
      for (const rank of RANKS) {
        const withPip = rank === 'A' || rank === 'K' || rank === 'Q' || rank === 'J';
        const l = cornerIndexLayout(lang.rankShort(rank), withPip);
        const b = indexBounds(l);
        expect(b.right, `${id} ${rank} "${l.label}" right`).toBeLessThanOrEqual(INDEX_MAX_X);
        expect(b.bottom, `${id} ${rank} "${l.label}" bottom`).toBeLessThanOrEqual(INDEX_MAX_Y);
        expect(l.fontSize).toBeGreaterThanOrEqual(6.5);
      }
    }
  });

  it('gives courts and aces a pip and number cards the numeral alone', () => {
    expect(cornerIndexLayout('K', true).pip).not.toBeNull();
    expect(cornerIndexLayout('VII', false).pip).toBeNull();
  });
});
