import { describe, expect, it } from 'vitest';
import { ROOMS } from '../src/cosmetics';
import { garb } from '../src/deck/palette';
import { ink, signal, surface, team, theme } from '../src/theme';

/**
 * WCAG contrast for the pairs the app actually sets: text tokens on the
 * grounds they sit on. Body text needs 4.5:1, large or bold display text and
 * UI components 3:1. A token that fails here fails on every screen at once,
 * which is the point of having tokens.
 */

type RGB = [number, number, number];

function parse(colour: string): { rgb: RGB; alpha: number } {
  const hex = colour.match(/^#([0-9a-f]{6})$/i);
  if (hex) {
    const v = parseInt(hex[1]!, 16);
    return { rgb: [(v >> 16) & 255, (v >> 8) & 255, v & 255], alpha: 1 };
  }
  const rgba = colour.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+))?\s*\)$/);
  if (rgba) {
    return { rgb: [Number(rgba[1]), Number(rgba[2]), Number(rgba[3])], alpha: rgba[4] === undefined ? 1 : Number(rgba[4]) };
  }
  throw new Error(`unparsable colour ${colour}`);
}

/** `top` drawn over `under` (both may carry alpha; `under` is taken as opaque over the page). */
function over(top: string, under: string): RGB {
  const t = parse(top);
  const u = parse(under);
  return [0, 1, 2].map((i) => Math.round(t.rgb[i]! * t.alpha + u.rgb[i]! * (1 - t.alpha))) as RGB;
}

function luminance([r, g, b]: RGB): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

export function contrast(fg: string, bg: string, page: string = theme.feltDeep): number {
  const ground = over(bg, page);
  const groundHex = `rgba(${ground[0]},${ground[1]},${ground[2]},1)`;
  const text = over(fg, groundHex);
  const l1 = luminance(text);
  const l2 = luminance(ground);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

const BODY = 4.5;
const LARGE = 3;

describe('the ink on the grounds', () => {
  const grounds: [string, string][] = [
    ['felt', theme.felt],
    ['feltDeep', theme.feltDeep],
    ['wood', theme.wood],
    ['panel', surface.panel],
    ['sunk', surface.sunk],
    ['chip', surface.chip],
  ];

  for (const [name, ground] of grounds) {
    it(`body text reads on ${name}`, () => {
      expect(contrast(ink.hi, ground)).toBeGreaterThanOrEqual(BODY);
      expect(contrast(ink.mid, ground)).toBeGreaterThanOrEqual(BODY);
      expect(contrast(theme.text, ground)).toBeGreaterThanOrEqual(BODY);
      expect(contrast(theme.textDim, ground)).toBeGreaterThanOrEqual(BODY);
    });
    it(`the outcome inks and team inks read on ${name}`, () => {
      expect(contrast(theme.okInk, ground)).toBeGreaterThanOrEqual(BODY);
      expect(contrast(theme.dangerInk, ground)).toBeGreaterThanOrEqual(BODY);
      expect(contrast(team.usInk, ground)).toBeGreaterThanOrEqual(BODY);
      expect(contrast(team.themInk, ground)).toBeGreaterThanOrEqual(BODY);
    });
    it(`gold and the turn signal stand out as components on ${name}`, () => {
      expect(contrast(theme.accent, ground)).toBeGreaterThanOrEqual(LARGE);
      expect(contrast(signal.turn, ground)).toBeGreaterThanOrEqual(BODY);
    });
  }

  it('the low ink is for 13 px and up, and clears the component bar everywhere', () => {
    for (const [, ground] of grounds) expect(contrast(ink.lo, ground)).toBeGreaterThanOrEqual(LARGE);
  });

  it('the bela button: ink on gold, never cream on gold', () => {
    expect(contrast(garb.ink, theme.accent)).toBeGreaterThanOrEqual(BODY);
    expect(contrast(theme.text, theme.accent)).toBeLessThan(LARGE); // which is why it is not used there
  });

  it('the outcome fills read as components on the deep felt', () => {
    expect(contrast(theme.ok, theme.feltDeep)).toBeGreaterThanOrEqual(LARGE);
    expect(contrast(theme.danger, theme.feltDeep)).toBeGreaterThanOrEqual(LARGE);
  });

  it('the clock colours read on the felt', () => {
    for (const c of [signal.clockFull, signal.clockMid, signal.clockLow]) {
      expect(contrast(c, theme.felt)).toBeGreaterThanOrEqual(LARGE);
    }
  });

  it('the inks the verification caught read in every room', () => {
    const rgb = (c: [number, number, number]) => `rgba(${c[0]},${c[1]},${c[2]},1)`;
    for (const [name, r] of Object.entries(ROOMS)) {
      // The lobby's connection error, on the page.
      expect(contrast(theme.dangerInk, r.page), `${name} error`).toBeGreaterThanOrEqual(BODY);
      // A stamp's word on its plate, over the lit baize it lands on.
      expect(contrast(theme.dangerInk, surface.scrim, r.feltLight), `${name} stamp`).toBeGreaterThanOrEqual(BODY);
      expect(contrast(theme.okInk, surface.scrim, r.feltLight), `${name} stamp`).toBeGreaterThanOrEqual(BODY);
      expect(contrast(theme.accent, surface.scrim, r.feltLight), `${name} stamp`).toBeGreaterThanOrEqual(LARGE);
      // The join field's placeholder: a chip on a panel on the page.
      const panel = rgb(over(surface.panel, r.page));
      expect(contrast(ink.mid, surface.chip, panel), `${name} placeholder`).toBeGreaterThanOrEqual(BODY);
      // The seat map's names on the lit baize.
      expect(contrast(ink.hi, r.feltLight), `${name} seat names`).toBeGreaterThanOrEqual(BODY);
      expect(contrast(theme.textDim, r.feltLight), `${name} dim names`).toBeLessThan(5.5); // the dim ink was the marginal one
    }
    // The armed reset button: cream on the deep red, not on the outcome red.
    expect(contrast(theme.text, garb.redDark)).toBeGreaterThanOrEqual(BODY);
    expect(contrast(theme.text, theme.danger)).toBeLessThan(BODY); // which is why
  });
});
