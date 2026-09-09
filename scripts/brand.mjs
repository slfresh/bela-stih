import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The brand's one source of drawing: the four mađarice pips from
 * apps/mobile/brand/paths.json (the very paths the in-app deck renders), a
 * card face built from them, and the felt they sit on. The icon script and
 * the store-art script both draw from here, so the mark on the launcher and
 * the mark in the listing can no longer drift apart — or away from the deck.
 */

export const PATHS = JSON.parse(
  readFileSync(join(process.cwd(), 'apps', 'mobile', 'brand', 'paths.json'), 'utf8'),
);

export const FELT_DEEP = '#0d2a1f';
export const FELT = '#123a2b';
export const FELT_LIGHT = '#1a4a37';
export const WOOD = '#3a2a1d';
export const GOLD = '#d9a41c';
export const GOLD_DARK = '#a3760a';
export const CREAM = '#f2efe6';
export const CARD = '#f7f4ec';
export const INK = '#2b2620';

/** A pip on its own 100-unit canvas, as SVG markup. */
export function pip(suit) {
  const shapes = PATHS.suits[suit];
  if (!shapes) throw new Error(`no pip for ${suit}`);
  return shapes
    .map((s) => {
      const fill = s.fill ? `fill="${s.fill}"` : 'fill="none"';
      const stroke = s.stroke ? ` stroke="${s.stroke}" stroke-width="${s.strokeWidth ?? 1}"` : '';
      return `<path d="${s.d}" ${fill}${stroke}/>`;
    })
    .join('\n');
}

/**
 * One card, on its own 0..100 × 0..145 canvas: cream stock, a double rule the
 * way a printed card is bordered, and one big centred pip.
 */
export function card(suit, { pipScale = 0.5 } = {}) {
  const size = 100 * pipScale;
  const x = (100 - size) / 2;
  const y = (145 - size) / 2;
  return `<rect width="100" height="145" rx="9" fill="${CARD}"/>
    <rect x="2" y="2" width="96" height="141" rx="7" fill="none" stroke="rgba(0,0,0,0.28)" stroke-width="1.6"/>
    <rect x="5" y="5" width="90" height="135" rx="5.5" fill="none" stroke="${GOLD_DARK}" stroke-width="0.8" opacity="0.5"/>
    <g transform="translate(${x} ${y}) scale(${pipScale})">${pip(suit)}</g>`;
}

/**
 * Two (or more) cards fanned about a common bottom pivot, centred at (cx, cy)
 * on the caller's canvas. `spread` is the total angle; `cardW` the width each
 * card is drawn at.
 */
export function fan(suits, { cx, cy, cardW, spread = 28, offset = 0.42 }) {
  const n = suits.length;
  const scale = cardW / 100;
  const cardH = 145 * scale;
  return suits
    .map((suit, i) => {
      const k = n === 1 ? 0 : i - (n - 1) / 2;
      const angle = n === 1 ? 0 : (spread * k) / (n - 1);
      // Each card a step to the right of the last, so every pip shows, and
      // all turned about a pivot below the hand.
      const x = cx + k * cardW * offset;
      const px = cx;
      const py = cy + cardH * 1.1;
      return `<g transform="rotate(${angle} ${px} ${py})">
      <g transform="translate(${x - cardW / 2} ${cy - cardH / 2}) scale(${scale})">${card(suit)}</g>
    </g>`;
    })
    .join('\n');
}

/** The felt's light: a radial wash, lighter above the centre, darker at the rim. */
export function feltDefs(id = 'felt') {
  return `<radialGradient id="${id}" cx="0.5" cy="0.42" r="0.7">
      <stop offset="0" stop-color="${FELT_LIGHT}"/>
      <stop offset="0.55" stop-color="${FELT}"/>
      <stop offset="1" stop-color="${FELT_DEEP}"/>
    </radialGradient>`;
}

/**
 * The mark: two fanned cards, acorn and heart, on a felt square with a thin
 * matte-gold rim set in from the edge. `size` is the canvas; `inset` how far
 * the rim sits in (0 for a full-bleed launcher icon, more for a splash mark);
 * `cardScale` the cards' share of the canvas.
 */
export function markSvg({ size, bg = true, rim = true, cardScale = 0.36, suits = ['acorns', 'hearts'], mono = null }) {
  const r = size * 0.22;
  const rimInset = size * 0.06;
  const cardW = size * cardScale;
  const cards = mono
    ? fan(suits, { cx: size / 2, cy: size / 2, cardW, offset: 0.3 }).replace(/fill="[^"]*"/g, `fill="${mono}"`).replace(/stroke="[^"]*"/g, `stroke="${mono}"`)
    : fan(suits, { cx: size / 2, cy: size / 2, cardW, offset: 0.3 });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>${feltDefs('felt')}</defs>
  ${bg ? `<rect width="${size}" height="${size}" rx="${r}" fill="url(#felt)"/>` : ''}
  ${bg && rim ? `<rect x="${rimInset}" y="${rimInset}" width="${size - 2 * rimInset}" height="${size - 2 * rimInset}" rx="${r - rimInset}" fill="none" stroke="${GOLD}" stroke-width="${size * 0.014}" opacity="0.9"/>` : ''}
  ${cards}
</svg>`;
}
