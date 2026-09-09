import { describe, expect, it } from 'vitest';
import { Lang, LOCALE_IDS } from '@belot/i18n';
import { HERO_ASPECT, heroBoxes, heroCollides, heroLayout, overlap } from '../src/home/heroLayout';

/**
 * The home table has to hold four things at once — two guests across, the
 * player in their chair, and the word that starts a game — at every width a
 * phone column can be. On a 360 dp phone the word used to sit across all
 * three: the pill's padding and type were fixed while the table's width was
 * not. This is the rule that was missing.
 */

/** Every width the lobby's content column can take, from a 320 dp phone up. */
const WIDTHS: number[] = [];
for (let w = 260; w <= 1000; w += 4) WIDTHS.push(w);

const LABELS = LOCALE_IDS.map((id) => new Lang(id).s.ui.play);

describe('the home table', () => {
  it('offers the three PLAY labels the app actually ships', () => {
    expect(LABELS).toContain('IGRAJ');
    expect(LABELS.length).toBe(LOCALE_IDS.length);
    for (const l of LABELS) expect(l.length).toBeGreaterThan(2);
  });

  it('never lays the word over a character, at any width, in any locale', () => {
    for (const w of WIDTHS) {
      for (const label of LABELS) {
        expect(heroCollides(w, label), `${w}dp "${label}"`).toBe(0);
      }
    }
  });

  it('keeps a real gap above and below the word, not merely a miss', () => {
    for (const w of WIDTHS) {
      for (const label of LABELS) {
        const b = heroBoxes(heroLayout(w, label));
        const above = b.pill.y - (b.guestL.y + b.guestL.h);
        const below = b.you.y - (b.pill.y + b.pill.h);
        expect(above, `${w}dp "${label}" above`).toBeGreaterThanOrEqual(4);
        expect(below, `${w}dp "${label}" below`).toBeGreaterThanOrEqual(4);
      }
    }
  });

  it('keeps every character inside the baize, clear of the rim', () => {
    // FeltArt's rim is 6 units of the box; nothing may be drawn under it.
    const RIM = 6;
    for (const w of WIDTHS) {
      const l = heroLayout(w, 'IGRAJ');
      const b = heroBoxes(l);
      for (const [name, box] of Object.entries(b)) {
        expect(box.x, `${w}dp ${name} left`).toBeGreaterThanOrEqual(RIM);
        expect(box.y, `${w}dp ${name} top`).toBeGreaterThanOrEqual(RIM);
        expect(box.x + box.w, `${w}dp ${name} right`).toBeLessThanOrEqual(l.width - RIM);
        expect(box.y + box.h, `${w}dp ${name} bottom`).toBeLessThanOrEqual(l.height - RIM);
      }
    }
  });

  it('grows the word with the table and then stops', () => {
    const small = heroLayout(320, 'IGRAJ');
    const large = heroLayout(900, 'IGRAJ');
    expect(small.pill.fontSize).toBeLessThan(large.pill.fontSize);
    expect(large.pill.fontSize).toBe(24);
    expect(small.pill.fontSize).toBeGreaterThanOrEqual(17);
    // A tablet's table does not get a tablet-sized pill: the cap holds.
    expect(heroLayout(2000, 'IGRAJ').pill.w).toBe(large.pill.w);
  });

  it('the guard itself can fail: the geometry it replaced collides', () => {
    // The shipped hero before this: 2:1, guests at 0.2/0.1 of the box, and a
    // pill whose padding (32) and type (24/30) never changed with the width.
    const width = 320;
    const height = Math.round(width * 0.5);
    const seat = Math.round(Math.min(56, width * 0.14));
    const you = Math.round(seat * 1.12);
    const pillW = 156;
    const pillH = 54;
    const old = {
      guestL: { x: Math.round(width * 0.2), y: Math.round(height * 0.1), w: seat, h: seat },
      you: { x: Math.round((width - you) / 2), y: height - Math.round(height * 0.07) - you, w: you, h: you },
      pill: { x: Math.round((width - pillW) / 2), y: Math.round((height - pillH) / 2), w: pillW, h: pillH },
    };
    expect(overlap(old.pill, old.guestL)).toBeGreaterThan(0);
    expect(overlap(old.pill, old.you)).toBeGreaterThan(0);
    // …and the same width is clear now.
    expect(heroCollides(width, 'IGRAJ')).toBe(0);
  });

  it('reserves its box by the aspect the layout draws to', () => {
    expect(HERO_ASPECT).toBeGreaterThan(1.5);
    for (const w of WIDTHS) {
      expect(heroLayout(w, 'IGRAJ').height).toBe(Math.round(w / HERO_ASPECT));
    }
  });
});
