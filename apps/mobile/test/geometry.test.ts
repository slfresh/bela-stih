import { describe, expect, it } from 'vitest';
import type { Seat } from '@belot/engine';
import {
  cardWidthForHeight,
  fanHeight,
  fanWidth,
  fitHand,
  MAX_CARD_W,
  POSITIONS,
  seatAt,
  seatPosition,
  slotOffsets,
} from '../src/table/geometry';

const SEATS: Seat[] = [0, 1, 2, 3];

describe('seat map', () => {
  it('draws the seat that acts after me on my right, from every chair', () => {
    // Bela runs counter-clockwise: the engine's next seat is `mySeat + 1`, and
    // that player must be the one on the right. This is the whole reason the
    // module exists, so assert it from all four chairs rather than one.
    for (const mySeat of SEATS) {
      const next = ((mySeat + 1) % 4) as Seat;
      const prev = ((mySeat + 3) % 4) as Seat;
      expect(seatPosition(mySeat, mySeat)).toBe('bottom');
      expect(seatPosition(next, mySeat)).toBe('right');
      expect(seatPosition(((mySeat + 2) % 4) as Seat, mySeat)).toBe('top');
      expect(seatPosition(prev, mySeat)).toBe('left');
    }
  });

  it('seatAt inverts seatPosition', () => {
    for (const mySeat of SEATS) {
      for (const seat of SEATS) {
        expect(seatAt(seatPosition(seat, mySeat), mySeat)).toBe(seat);
      }
      for (const pos of POSITIONS) {
        expect(seatPosition(seatAt(pos, mySeat), mySeat)).toBe(pos);
      }
    }
  });
});

describe('slotOffsets', () => {
  it('reproduces the hand-tuned cross at the reference 46x67 slot', () => {
    // Pinned so the responsive rewrite is provably pixel-identical on the
    // phone the layout was originally tuned on.
    expect(slotOffsets(46, 67)).toEqual({
      bottom: { left: '50%', marginLeft: -23, top: '55%', marginTop: 39 },
      top: { left: '50%', marginLeft: -23, top: '55%', marginTop: -106 },
      left: { left: '50%', marginLeft: -77, top: '55%', marginTop: -33 },
      right: { left: '50%', marginLeft: 31, top: '55%', marginTop: -33 },
    });
  });

  it('keeps the cross symmetric and non-overlapping at any scale', () => {
    for (const scale of [0.72, 1, 1.3, 2]) {
      const w = Math.round(46 * scale);
      const h = Math.round(67 * scale);
      const o = slotOffsets(w, h);
      // Opposite arms mirror each other around the centre...
      expect(o.top.marginTop + h).toBe(-o.bottom.marginTop);
      expect(o.left.marginLeft + w).toBe(-o.right.marginLeft);
      // ...and neither pair ever collides in the middle.
      expect(o.right.marginLeft).toBeGreaterThan(0);
      expect(o.bottom.marginTop).toBeGreaterThan(0);
    }
  });
});

describe('fitHand', () => {
  it('keeps eight cards on one row on the narrowest phone we support', () => {
    // 320dp minus the root padding. Overflowing here is what produced the
    // two-row hand players complain about in rival apps.
    const fit = fitHand(320 - 24, 8);
    expect(fanWidth(fit, 8)).toBeLessThanOrEqual(320 - 24 + 0.5);
    expect(fit.cardW).toBeGreaterThanOrEqual(40);
  });

  it('counts the width the TURNED outer cards sweep, not just the upright span', () => {
    // The cards are rotated, so a fan is wider than the sum of its parts.
    // Measuring the upright span let the outermost cards run off both edges of
    // a real phone while every test stayed green.
    for (const width of [296, 366, 390, 420]) {
      const fit = fitHand(width, 8);
      expect(fanWidth(fit, 8)).toBeGreaterThan(fit.cardW + fit.advance * 7);
      expect(fanWidth(fit, 8)).toBeLessThanOrEqual(width + 0.5);
    }
  });

  it('never hides more than half a card, and never grows past the cap', () => {
    for (const width of [280, 296, 360, 390, 520, 900]) {
      const fit = fitHand(width, 8);
      expect(fit.advance / fit.cardW).toBeGreaterThanOrEqual(0.42 - 1e-9);
      expect(fit.cardW).toBeLessThanOrEqual(MAX_CARD_W);
      expect(fanWidth(fit, 8)).toBeLessThanOrEqual(width + 0.5);
    }
  });

  it("honours the caller's own cap, which is what a phone actually passes", () => {
    // The module ceiling exists for desktop, where the felt grows and postage
    // -stamp cards look absurd. A handset passes its own, much lower, cap and
    // that one has to win.
    for (const width of [280, 360, 520, 900]) {
      for (const cap of [44, 58, 76]) {
        expect(fitHand(width, 8, cap).cardW).toBeLessThanOrEqual(cap);
      }
    }
  });

  it('handles the empty and single-card hands at the end of a deal', () => {
    expect(fitHand(360, 0).overlap).toBe(0);
    expect(fitHand(360, 1).advance).toBe(0);
  });
});

describe('fanHeight', () => {
  it('reserves the arc and the lift, not just the card', () => {
    // Reserving only the card height is what clipped the outer cards off the
    // bottom of a landscape screen.
    const fit = fitHand(628, 8);
    expect(fanHeight(fit.cardW, 8)).toBeGreaterThan(fit.cardH + 30);
  });

  it('inverts exactly, so a height budget yields a card that fits it', () => {
    for (const budget of [110, 133, 180, 240]) {
      const w = cardWidthForHeight(budget, 8);
      expect(fanHeight(w, 8)).toBeCloseTo(budget, 6);
    }
  });

  it('keeps a landscape hand inside a third of a 390dp-tall screen', () => {
    const cap = Math.floor(cardWidthForHeight(390 * 0.34, 8));
    const fit = fitHand(628, 8, cap);
    expect(fanHeight(fit.cardW, 8)).toBeLessThanOrEqual(390 * 0.34);
  });
});
