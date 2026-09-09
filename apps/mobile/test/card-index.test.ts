import { describe, expect, it } from 'vitest';
import { RANKS } from '@belot/shared-types';
import { Lang, LOCALE_IDS } from '@belot/i18n';
import {
  CAP_HEIGHT,
  cornerIndexLayout,
  indexBounds,
  INDEX_FONT,
  INDEX_FONT_PIP,
  INDEX_MAX_X,
  INDEX_MAX_Y,
} from '../src/deck/cornerIndex';
import { fitHand } from '../src/table/geometry';
import { computeTableMetrics } from '../src/table/metrics';

/**
 * The card art was drawn to dodge the corner box; the index must stay in it
 * for every label every locale can put there — Roman VIII included — and it
 * must be large enough to do its one job: name the rank in a fan.
 */
const withPipOf = (rank: string) => rank === 'A' || rank === 'K' || rank === 'Q' || rank === 'J';

function everyLabel(): { id: string; rank: string; label: string; withPip: boolean }[] {
  const out = [];
  for (const id of LOCALE_IDS) {
    const lang = new Lang(id);
    for (const rank of RANKS) out.push({ id, rank, label: lang.rankShort(rank), withPip: withPipOf(rank) });
  }
  return out;
}

describe('the corner index', () => {
  it('stays inside the box the art dodges, for every rank in every locale', () => {
    for (const { id, rank, label, withPip } of everyLabel()) {
      const l = cornerIndexLayout(label, withPip);
      const b = indexBounds(l);
      expect(b.right, `${id} ${rank} "${label}" right`).toBeLessThanOrEqual(INDEX_MAX_X);
      expect(b.bottom, `${id} ${rank} "${label}" bottom`).toBeLessThanOrEqual(INDEX_MAX_Y);
      expect(b.top, `${id} ${rank} "${label}" top`).toBeGreaterThanOrEqual(2);
    }
  });

  it('is as large as the box allows, and condenses a long run rather than shrinking it', () => {
    // Sized by character count it put VIII at 6.5 units: 3 px on a phone's fan.
    for (const { id, rank, label, withPip } of everyLabel()) {
      const l = cornerIndexLayout(label, withPip);
      expect(l.fontSize, `${id} ${rank}`).toBe(withPip ? INDEX_FONT_PIP : INDEX_FONT);
      expect(l.scaleX, `${id} ${rank} squeezed`).toBeGreaterThanOrEqual(0.8);
      expect(l.scaleX).toBeLessThanOrEqual(1);
    }
    expect(cornerIndexLayout('VIII', false).scaleX).toBeLessThan(1);
    expect(cornerIndexLayout('X', false).scaleX).toBe(1);
  });

  it('reads in the fan of a 360 dp phone', () => {
    // The fan shows the left third of each card, and the index is what names
    // the rank there. Its cap height on the screen, in px.
    const m = computeTableMetrics(360, 740);
    const unit = fitHand(m.handWidth, 8, m.handCardMax).cardW / 100;
    expect(unit * 100).toBeLessThan(56); // the phone the size was chosen for
    for (const { id, rank, label, withPip } of everyLabel()) {
      const l = cornerIndexLayout(label, withPip);
      expect(CAP_HEIGHT * l.fontSize * unit, `${id} ${rank} "${label}" cap height px`).toBeGreaterThanOrEqual(4.4);
    }
  });

  it('gives courts and aces a pip and number cards the numeral alone', () => {
    expect(cornerIndexLayout('K', true).pip).not.toBeNull();
    expect(cornerIndexLayout('VII', false).pip).toBeNull();
  });
});
