import { Resvg } from '@resvg/resvg-js';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Generates the app icons from drawn SVG — no binary art to keep in the repo and
 * no licensing questions.
 *
 * The mark is a `list` (leaf) pip on felt: unmistakably a mađarice suit, and
 * deliberately NOT casino imagery. Chips, dice and slot reels are what push the
 * IARC questionnaire toward a "Simulated Gambling" descriptor and PEGI 18.
 *
 *   node scripts/make-icons.mjs
 */

const OUT = join(process.cwd(), 'apps', 'mobile', 'assets');

const FELT = '#123a2b';
const LEAF = '#3f9e4d';
const VEIN = '#1d5325';

/** The leaf, on a 0..100 canvas — same geometry as the in-app pip. */
const leafPath =
  'M50 6c26 18 36 42 26 60-7 13-18 20-26 26-8-6-19-13-26-26C14 48 24 24 50 6z';
const veinPath = 'M48 30h4v60h-4z';

/** `scale` is the leaf's share of the canvas; adaptive icons need generous margin. */
function leafSvg({ size, bg, leaf, vein, scale }) {
  const s = (size * scale) / 100;
  const offset = (size - size * scale) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  ${bg ? `<rect width="${size}" height="${size}" fill="${bg}"/>` : ''}
  <g transform="translate(${offset} ${offset}) scale(${s})">
    <path d="${leafPath}" fill="${leaf}"/>
    ${vein ? `<path d="${veinPath}" fill="${vein}"/>` : ''}
  </g>
</svg>`;
}

function render(name, svg, width) {
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: width } })
    .render()
    .asPng();
  writeFileSync(join(OUT, name), png);
  console.log(`  ${name}  ${width}x${width}  ${(png.length / 1024).toFixed(0)}KB`);
}

console.log('Writing icons to', OUT);

// Store / launcher icon: leaf on felt, filling most of the square.
render('icon.png', leafSvg({ size: 1024, bg: FELT, leaf: LEAF, vein: VEIN, scale: 0.62 }), 1024);

// Adaptive icon: the inner ~66% is the only guaranteed-visible area, so the
// foreground sits well inside it and the background is a flat felt plate.
render(
  'android-icon-foreground.png',
  leafSvg({ size: 1024, bg: null, leaf: LEAF, vein: VEIN, scale: 0.42 }),
  1024,
);
render('android-icon-background.png', leafSvg({ size: 1024, bg: FELT, scale: 0 }), 1024);
render(
  'android-icon-monochrome.png',
  leafSvg({ size: 1024, bg: null, leaf: '#ffffff', vein: null, scale: 0.42 }),
  1024,
);

// Splash mark sits on the themed background from app.json.
render('splash-icon.png', leafSvg({ size: 1024, bg: null, leaf: LEAF, vein: VEIN, scale: 0.5 }), 1024);
render('favicon.png', leafSvg({ size: 96, bg: FELT, leaf: LEAF, vein: VEIN, scale: 0.62 }), 96);

console.log('Done.');
